import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Insertable } from 'kysely';
import { JOBS_ASSET_PAGINATION_SIZE } from 'src/constants';
import { OnJob } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import { BulkIdErrorReason, BulkIdResponseDto, BulkIdsDto } from 'src/dtos/asset-ids.response.dto';
import {
  AssetPetCreateDto,
  AssetPetDeleteDto,
  AssetPetQueryDto,
  AssetPetResponseDto,
  AssetPetUpdateDto,
  mapAssetPet,
  mapAssetPetWithoutPet,
  mapPet,
  MergePetDto,
  PetCreateDto,
  PetResponseDto,
  PetSearchDto,
  PetsResponseDto,
  PetStatisticsResponseDto,
  PetsUpdateDto,
  PetUpdateDto,
  ReassignPetDetectionDto,
} from 'src/dtos/pet.dto';
import { AssetVisibility, CacheControl, JobName, JobStatus, Permission, QueueName, SourceType, VectorIndex } from 'src/enum';
import { BoundingBox } from 'src/repositories/machine-learning.repository';
import { AssetPetTable } from 'src/schema/tables/asset-pet.table';
import { PetSearchTable } from 'src/schema/tables/pet-search.table';
import { BaseService } from 'src/services/base.service';
import { JobItem, JobOf } from 'src/types';
import { ImmichFileResponse } from 'src/utils/file';
import { mimeTypes } from 'src/utils/mime-types';
import { isPetRecognitionEnabled } from 'src/utils/misc';

const COCO_CLASS_SPECIES: Record<number, string> = {
  15: 'cat',
  16: 'dog',
  17: 'horse',
  18: 'sheep',
  19: 'cow',
  20: 'elephant',
  21: 'bear',
  22: 'zebra',
  23: 'giraffe',
};

function cocoClassToSpecies(classId: number): string {
  return COCO_CLASS_SPECIES[classId] ?? 'unknown';
}

@Injectable()
export class PetService extends BaseService {
  async getAll(auth: AuthDto, { withHidden = false, page, size }: PetSearchDto): Promise<PetsResponseDto> {
    const pagination = { take: size, skip: (page - 1) * size };
    const pets = [];
    for await (const pet of this.petRepository.getAll({ ownerId: auth.user.id, isHidden: withHidden ? undefined : false })) {
      pets.push(pet);
    }
    const sliced = pets.slice(pagination.skip, pagination.skip + pagination.take);
    const hasNextPage = pagination.skip + pagination.take < pets.length;
    const { total, hidden } = await this.petRepository.getNumberOfPets(auth.user.id);
    return { total, hidden, pets: sliced.map((p) => mapPet(p)), hasNextPage };
  }

  async create(auth: AuthDto, dto: PetCreateDto): Promise<PetResponseDto> {
    const pet = await this.petRepository.create({
      ownerId: auth.user.id,
      name: dto.name ?? '',
      isHidden: dto.isHidden ?? false,
      isFavorite: dto.isFavorite ?? false,
      color: dto.color ?? null,
    });
    return mapPet(pet);
  }

  async getById(auth: AuthDto, id: string): Promise<PetResponseDto> {
    await this.requireAccess({ auth, permission: Permission.PetRead, ids: [id] });
    const pet = await this.petRepository.getById(id);
    if (!pet) {
      throw new NotFoundException('Pet not found');
    }
    return mapPet(pet);
  }

  async update(auth: AuthDto, id: string, dto: PetUpdateDto): Promise<PetResponseDto> {
    await this.requireAccess({ auth, permission: Permission.PetUpdate, ids: [id] });

    const { thumbnailAssetId: assetId, ...rest } = dto;
    let detectionId: string | null | undefined = undefined;

    if (assetId) {
      await this.requireAccess({ auth, permission: Permission.AssetRead, ids: [assetId] });
      const detection = await this.petRepository.getForThumbnailAssetUpdate({ petId: id, assetId });
      if (!detection) {
        throw new BadRequestException('No pet detection found for this asset or asset is offline');
      }
      detectionId = detection.id;
    } else if (assetId === null) {
      detectionId = null;
    }

    const pet = await this.petRepository.update({ id, thumbnailAssetId: detectionId, ...rest });

    if (detectionId) {
      await this.jobRepository.queue({ name: JobName.PetGenerateThumbnail, data: { id } });
    }

    return mapPet(pet);
  }

  async updateAll(auth: AuthDto, dto: PetsUpdateDto): Promise<BulkIdResponseDto[]> {
    const results: BulkIdResponseDto[] = [];
    for (const pet of dto.pets) {
      try {
        await this.update(auth, pet.id, {
          name: pet.name,
          isHidden: pet.isHidden,
          isFavorite: pet.isFavorite,
          color: pet.color,
          thumbnailAssetId: pet.thumbnailAssetId,
        });
        results.push({ id: pet.id, success: true });
      } catch (error: Error | any) {
        this.logger.error(`Unable to update pet ${pet.id}: ${error}`, error?.stack);
        results.push({ id: pet.id, success: false, error: BulkIdErrorReason.UNKNOWN });
      }
    }
    return results;
  }

  async delete(auth: AuthDto, id: string): Promise<void> {
    await this.requireAccess({ auth, permission: Permission.PetDelete, ids: [id] });
    const pet = await this.petRepository.getById(id);
    if (pet?.thumbnailPath) {
      await this.storageRepository.unlink(pet.thumbnailPath);
    }
    await this.petRepository.delete([id]);
  }

  async deleteAll(auth: AuthDto, { ids }: BulkIdsDto): Promise<void> {
    await this.requireAccess({ auth, permission: Permission.PetDelete, ids });
    const pets = [];
    for (const id of ids) {
      const pet = await this.petRepository.getById(id);
      if (pet) {
        pets.push(pet);
      }
    }
    await Promise.all(pets.filter((p) => p.thumbnailPath).map((p) => this.storageRepository.unlink(p.thumbnailPath)));
    await this.petRepository.delete(pets.map((p) => p.id));
  }

  async getStatistics(auth: AuthDto, id: string): Promise<PetStatisticsResponseDto> {
    await this.requireAccess({ auth, permission: Permission.PetRead, ids: [id] });
    return this.petRepository.getStatistics(id);
  }

  async getThumbnail(auth: AuthDto, id: string): Promise<ImmichFileResponse> {
    await this.requireAccess({ auth, permission: Permission.PetRead, ids: [id] });
    const pet = await this.petRepository.getById(id);
    if (!pet || !pet.thumbnailPath) {
      throw new NotFoundException();
    }
    return new ImmichFileResponse({
      path: pet.thumbnailPath,
      contentType: mimeTypes.lookup(pet.thumbnailPath),
      cacheControl: CacheControl.PrivateWithoutCache,
    });
  }

  async reassignDetections(auth: AuthDto, petId: string, dto: AssetPetUpdateDto): Promise<PetResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.PetUpdate, ids: [petId] });
    const results: PetResponseDto[] = [];
    for (const { assetId, petId: sourcePetId } of dto.data) {
      const ids: string[] = [];
      for await (const det of this.petRepository.getAllDetections({ petId: sourcePetId, assetId })) {
        ids.push(det.id);
      }
      if (ids.length > 0) {
        await this.petRepository.reassign({ detectionIds: ids, newPetId: petId });
      }
      const pet = await this.petRepository.getById(petId);
      if (pet) {
        results.push(mapPet(pet));
      }
    }
    return results;
  }

  async mergePet(auth: AuthDto, id: string, { ids }: MergePetDto): Promise<BulkIdResponseDto[]> {
    if (ids.includes(id)) {
      throw new BadRequestException('Cannot merge a pet into itself');
    }
    await this.requireAccess({ auth, permission: Permission.PetUpdate, ids: [id] });

    const allowedIds = await this.checkAccess({ auth, permission: Permission.PetMerge, ids });
    const results: BulkIdResponseDto[] = [];

    for (const sourceId of ids) {
      if (!allowedIds.has(sourceId)) {
        results.push({ id: sourceId, success: false, error: BulkIdErrorReason.NO_PERMISSION });
        continue;
      }
      try {
        const source = await this.petRepository.getById(sourceId);
        if (!source) {
          results.push({ id: sourceId, success: false, error: BulkIdErrorReason.NOT_FOUND });
          continue;
        }
        await this.petRepository.reassignByPetId(sourceId, id);
        if (source.thumbnailPath) {
          await this.storageRepository.unlink(source.thumbnailPath);
        }
        await this.petRepository.delete([sourceId]);
        results.push({ id: sourceId, success: true });
      } catch (error: Error | any) {
        this.logger.error(`Unable to merge pet ${sourceId} into ${id}: ${error}`, error?.stack);
        results.push({ id: sourceId, success: false, error: BulkIdErrorReason.UNKNOWN });
      }
    }
    return results;
  }

  async getDetectionsByAssetId(auth: AuthDto, { assetId }: AssetPetQueryDto): Promise<AssetPetResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.AssetRead, ids: [assetId] });
    const detections = await this.petRepository.getDetectionsByAssetId(assetId);
    return detections.map((d) => mapAssetPet(d, auth));
  }

  async createDetection(auth: AuthDto, dto: AssetPetCreateDto): Promise<AssetPetResponseDto> {
    await Promise.all([
      this.requireAccess({ auth, permission: Permission.AssetRead, ids: [dto.assetId] }),
      this.requireAccess({ auth, permission: Permission.PetRead, ids: [dto.petId] }),
    ]);

    const id = this.cryptoRepository.randomUUID();
    const detection = await this.petRepository.createDetection({
      id,
      assetId: dto.assetId,
      petId: dto.petId,
      imageWidth: dto.imageWidth,
      imageHeight: dto.imageHeight,
      boundingBoxX1: dto.x,
      boundingBoxY1: dto.y,
      boundingBoxX2: dto.x + dto.width,
      boundingBoxY2: dto.y + dto.height,
      sourceType: SourceType.Manual,
    });
    const pet = await this.petRepository.getById(dto.petId);
    return { ...mapAssetPetWithoutPet(detection), pet: pet ? mapPet(pet) : null };
  }

  async reassignDetectionById(auth: AuthDto, id: string, { petId }: ReassignPetDetectionDto): Promise<PetResponseDto> {
    await this.requireAccess({ auth, permission: Permission.PetReassign, ids: [id] });
    await this.requireAccess({ auth, permission: Permission.PetUpdate, ids: [petId] });
    await this.petRepository.reassign({ detectionIds: [id], newPetId: petId });
    const pet = await this.petRepository.getById(petId);
    if (!pet) {
      throw new NotFoundException('Pet not found');
    }
    return mapPet(pet);
  }

  async deleteDetection(auth: AuthDto, id: string, { force }: AssetPetDeleteDto): Promise<void> {
    await this.requireAccess({ auth, permission: Permission.PetDelete, ids: [id] });
    await (force ? this.petRepository.deleteDetection(id) : this.petRepository.softDeleteDetection(id));
  }

  @OnJob({ name: JobName.PetDetectionQueueAll, queue: QueueName.PetDetection })
  async handleQueueDetectPets({ force }: JobOf<JobName.PetDetectionQueueAll>): Promise<JobStatus> {
    const { machineLearning } = await this.getConfig({ withCache: false });
    if (!isPetRecognitionEnabled(machineLearning)) {
      return JobStatus.Skipped;
    }

    if (force) {
      await this.petRepository.deleteDetections({ sourceType: SourceType.MachineLearning });
      await this.handlePetCleanup();
      await this.petRepository.vacuum({ reindexVectors: true });
    }

    let jobs: JobItem[] = [];
    const assets = this.assetJobRepository.streamForDetectPetsJob(force);
    for await (const asset of assets) {
      jobs.push({ name: JobName.PetDetection, data: { id: asset.id } });
      if (jobs.length >= JOBS_ASSET_PAGINATION_SIZE) {
        await this.jobRepository.queueAll(jobs);
        jobs = [];
      }
    }
    await this.jobRepository.queueAll(jobs);

    if (force === undefined) {
      await this.jobRepository.queue({ name: JobName.PetCleanup });
    }

    return JobStatus.Success;
  }

  @OnJob({ name: JobName.PetDetection, queue: QueueName.PetDetection })
  async handleDetectPets({ id }: JobOf<JobName.PetDetection>): Promise<JobStatus> {
    const { machineLearning } = await this.getConfig({ withCache: true });
    if (!isPetRecognitionEnabled(machineLearning)) {
      return JobStatus.Skipped;
    }

    const asset = await this.assetJobRepository.getForDetectFacesJob(id);
    const previewFile = asset?.files[0];
    if (!asset || asset.files.length !== 1 || !previewFile) {
      return JobStatus.Failed;
    }

    if (asset.visibility === AssetVisibility.Hidden) {
      return JobStatus.Skipped;
    }

    const { detectionModelName, recognitionModelName, classFilter, minScore } = machineLearning.petRecognition;
    const { imageHeight, imageWidth, pets } = await this.machineLearningRepository.detectPets(
      previewFile.path,
      { modelName: detectionModelName, minScore, classFilter },
      { modelName: recognitionModelName },
    );
    this.logger.debug(`${pets.length} pets detected in ${previewFile.path}`);

    const existingDetections = await this.petRepository.getDetectionsByAssetId(id);
    const detectionsToAdd: (Insertable<AssetPetTable> & { id: string })[] = [];
    const embeddings: PetSearchTable[] = [];
    const mlDetectionIds = new Set<string>(existingDetections.map((d) => d.id));

    const heightScale = imageHeight / (existingDetections[0]?.imageHeight || 1);
    const widthScale = imageWidth / (existingDetections[0]?.imageWidth || 1);

    for (const { boundingBox, embedding, classId } of pets) {
      const scaledBox = {
        x1: boundingBox.x1 * widthScale,
        y1: boundingBox.y1 * heightScale,
        x2: boundingBox.x2 * widthScale,
        y2: boundingBox.y2 * heightScale,
      };
      const match = existingDetections.find((det) => this.iou(det, scaledBox) > 0.5);

      if (match) {
        mlDetectionIds.delete(match.id);
        embeddings.push({ petId: match.id, embedding });
      } else {
        const detectionId = this.cryptoRepository.randomUUID();
        detectionsToAdd.push({
          id: detectionId,
          assetId: asset.id,
          imageHeight,
          imageWidth,
          boundingBoxX1: boundingBox.x1,
          boundingBoxY1: boundingBox.y1,
          boundingBoxX2: boundingBox.x2,
          boundingBoxY2: boundingBox.y2,
          species: cocoClassToSpecies(classId),
        });
        embeddings.push({ petId: detectionId, embedding });
      }
    }
    const detectionIdsToRemove = [...mlDetectionIds];

    if (detectionsToAdd.length > 0 || detectionIdsToRemove.length > 0 || embeddings.length > 0) {
      await this.petRepository.refreshDetections(detectionsToAdd, detectionIdsToRemove, embeddings);
    }

    if (detectionIdsToRemove.length > 0) {
      this.logger.log(`Removed ${detectionIdsToRemove.length} pet detections below threshold in asset ${id}`);
    }

    if (detectionsToAdd.length > 0) {
      this.logger.log(`Detected ${detectionsToAdd.length} new pets in asset ${id}`);
      const jobs = detectionsToAdd.map(
        (det) => ({ name: JobName.PetRecognition, data: { id: det.id, deferred: false } }) as const,
      );
      await this.jobRepository.queueAll([{ name: JobName.PetRecognitionQueueAll, data: { force: false } }, ...jobs]);
    }

    await this.assetRepository.upsertJobStatus({ assetId: asset.id, petsRecognizedAt: new Date() });

    return JobStatus.Success;
  }

  @OnJob({ name: JobName.PetRecognitionQueueAll, queue: QueueName.PetRecognition })
  async handleQueueRecognizePets({ force, nightly }: JobOf<JobName.PetRecognitionQueueAll>): Promise<JobStatus> {
    const { machineLearning } = await this.getConfig({ withCache: false });
    if (!isPetRecognitionEnabled(machineLearning)) {
      return JobStatus.Skipped;
    }

    await this.jobRepository.waitForQueueCompletion(QueueName.ThumbnailGeneration, QueueName.PetDetection);

    if (nightly) {
      const latestDetectionDate = await this.petRepository.getLatestDetectionDate();
      if (!latestDetectionDate) {
        this.logger.debug('Skipping pet recognition nightly since no detections exist');
        return JobStatus.Skipped;
      }
    }

    const { waiting } = await this.jobRepository.getJobCounts(QueueName.PetRecognition);

    if (force) {
      await this.petRepository.unassignDetections({ sourceType: SourceType.MachineLearning });
      await this.handlePetCleanup();
      await this.petRepository.vacuum({ reindexVectors: false });
    } else if (waiting) {
      this.logger.debug(
        `Skipping pet recognition queueing because ${waiting} job${waiting > 1 ? 's are' : ' is'} already queued`,
      );
      return JobStatus.Skipped;
    }

    await this.databaseRepository.prewarm(VectorIndex.Pet);

    const detectionPagination = this.petRepository.getAllDetections(force ? undefined : { petId: null });
    let jobs: { name: JobName.PetRecognition; data: { id: string; deferred: false } }[] = [];
    for await (const detection of detectionPagination) {
      jobs.push({ name: JobName.PetRecognition, data: { id: detection.id, deferred: false } });
      if (jobs.length === JOBS_ASSET_PAGINATION_SIZE) {
        await this.jobRepository.queueAll(jobs);
        jobs = [];
      }
    }
    await this.jobRepository.queueAll(jobs);

    return JobStatus.Success;
  }

  @OnJob({ name: JobName.PetRecognition, queue: QueueName.PetRecognition })
  async handleRecognizePets({ id, deferred }: JobOf<JobName.PetRecognition>): Promise<JobStatus> {
    const { machineLearning } = await this.getConfig({ withCache: true });
    if (!isPetRecognitionEnabled(machineLearning)) {
      return JobStatus.Skipped;
    }

    const detection = await this.petRepository.getDetectionForRecognitionJob(id);
    if (!detection || !detection.asset) {
      this.logger.warn(`Pet detection ${id} not found`);
      return JobStatus.Failed;
    }

    if (!detection.petSearch?.embedding) {
      this.logger.warn(`Pet detection ${id} does not have an embedding`);
      return JobStatus.Failed;
    }

    if (detection.petId) {
      this.logger.debug(`Pet detection ${id} already has a pet assigned`);
      return JobStatus.Skipped;
    }

    const { minPets, maxDistance } = machineLearning.petRecognition;
    const matches = await this.searchRepository.searchPets({
      userIds: [detection.asset.ownerId],
      embedding: detection.petSearch.embedding,
      maxDistance,
      numResults: minPets,
    });

    const isCore = matches.length >= minPets && detection.asset.visibility === AssetVisibility.Timeline;

    if (!isCore && !deferred) {
      this.logger.debug(`Deferring non-core pet detection ${id} for later processing`);
      await this.jobRepository.queue({ name: JobName.PetRecognition, data: { id, deferred: true } });
      return JobStatus.Skipped;
    }

    let petId = matches.find((match) => match.petId)?.petId;

    if (!petId) {
      const matchWithPet = await this.searchRepository.searchPets({
        userIds: [detection.asset.ownerId],
        embedding: detection.petSearch.embedding,
        maxDistance,
        numResults: 1,
        hasPet: true,
      });
      if (matchWithPet.length > 0) {
        petId = matchWithPet[0].petId;
      }
    }

    if (isCore && !petId) {
      this.logger.log(`Creating new pet for detection ${id}`);
      const newPet = await this.petRepository.create({
        ownerId: detection.asset.ownerId,
        thumbnailAssetId: id,
        species: detection.species,
      });
      await this.jobRepository.queue({ name: JobName.PetGenerateThumbnail, data: { id: newPet.id } });
      petId = newPet.id;
    }

    if (petId) {
      this.logger.debug(`Assigning pet detection ${id} to pet ${petId}`);
      await this.petRepository.reassign({ detectionIds: [id], newPetId: petId });
    }

    return JobStatus.Success;
  }

  @OnJob({ name: JobName.PetCleanup, queue: QueueName.BackgroundTask })
  async handlePetCleanup(): Promise<JobStatus> {
    const pets = await this.petRepository.getAllWithoutDetections();
    if (pets.length > 0) {
      await this.petRepository.delete(pets.map((pet) => pet.id));
      this.logger.debug(`Deleted ${pets.length} pets without detections`);
    }
    return JobStatus.Success;
  }

  private iou(
    detection: { boundingBoxX1: number; boundingBoxY1: number; boundingBoxX2: number; boundingBoxY2: number },
    newBox: BoundingBox,
  ): number {
    const x1 = Math.max(detection.boundingBoxX1, newBox.x1);
    const y1 = Math.max(detection.boundingBoxY1, newBox.y1);
    const x2 = Math.min(detection.boundingBoxX2, newBox.x2);
    const y2 = Math.min(detection.boundingBoxY2, newBox.y2);

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 =
      (detection.boundingBoxX2 - detection.boundingBoxX1) * (detection.boundingBoxY2 - detection.boundingBoxY1);
    const area2 = (newBox.x2 - newBox.x1) * (newBox.y2 - newBox.y1);
    const union = area1 + area2 - intersection;

    return intersection / union;
  }
}

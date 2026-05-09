import { Selectable } from 'kysely';
import { createZodDto } from 'nestjs-zod';
import { AssetPet, Pet } from 'src/database';
import { HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import { SourceTypeSchema } from 'src/enum';
import { AssetPetTable } from 'src/schema/tables/asset-pet.table';
import { MaybeDehydrated } from 'src/types';
import { asDateString } from 'src/utils/date';
import { emptyStringToNull, hexColor, stringToBool } from 'src/validation';
import z from 'zod';

const PetCreateSchema = z
  .object({
    name: z.string().optional().describe('Pet name'),
    isHidden: z.boolean().optional().describe('Pet visibility (hidden)'),
    isFavorite: z.boolean().optional().describe('Mark as favorite'),
    color: emptyStringToNull(hexColor.nullable()).optional().describe('Pet color (hex)'),
  })
  .meta({ id: 'PetCreateDto' });

const PetUpdateSchema = PetCreateSchema.extend({
  thumbnailAssetId: z.uuidv4().nullable().optional().describe('Asset ID used for thumbnail'),
}).meta({ id: 'PetUpdateDto' });

const PetsUpdateItemSchema = PetUpdateSchema.extend({
  id: z.string().describe('Pet ID'),
}).meta({ id: 'PetsUpdateItem' });

const PetsUpdateSchema = z
  .object({
    pets: z.array(PetsUpdateItemSchema).describe('Pets to update'),
  })
  .meta({ id: 'PetsUpdateDto' });

const MergePetSchema = z
  .object({
    ids: z.array(z.uuidv4()).describe('Pet IDs to merge into the target'),
  })
  .meta({ id: 'MergePetDto' });

const PetSearchSchema = z
  .object({
    withHidden: stringToBool.optional().describe('Include hidden pets'),
    closestPetId: z.uuidv4().optional().describe('Closest pet ID for similarity search'),
    closestAssetId: z.uuidv4().optional().describe('Closest asset ID for similarity search'),
    page: z.coerce.number().int().min(1).default(1).describe('Page number'),
    size: z.coerce.number().int().min(1).max(1000).default(500).describe('Page size'),
  })
  .meta({ id: 'PetSearchDto' });

export const PetResponseSchema = z
  .object({
    id: z.string().describe('Pet ID'),
    name: z.string().describe('Pet name'),
    species: z.string().describe('Pet species'),
    thumbnailPath: z.string().describe('Thumbnail path'),
    isHidden: z.boolean().describe('Is hidden'),
    updatedAt: z
      .string()
      .meta({ format: 'date-time' })
      .optional()
      .describe('Last update date')
      .meta(new HistoryBuilder().added('v1').stable('v2').getExtensions()),
    isFavorite: z
      .boolean()
      .optional()
      .describe('Is favorite')
      .meta(new HistoryBuilder().added('v1').stable('v2').getExtensions()),
    color: z
      .string()
      .optional()
      .describe('Pet color (hex)')
      .meta(new HistoryBuilder().added('v1').stable('v2').getExtensions()),
  })
  .meta({ id: 'PetResponseDto' });

const PetsResponseSchema = z
  .object({
    total: z.int().min(0).describe('Total number of pets'),
    hidden: z.int().min(0).describe('Number of hidden pets'),
    pets: z.array(PetResponseSchema),
    hasNextPage: z
      .boolean()
      .optional()
      .describe('Whether there are more pages')
      .meta(new HistoryBuilder().added('v1').stable('v2').getExtensions()),
  })
  .meta({ id: 'PetsResponseDto' });

export const AssetPetWithoutPetResponseSchema = z
  .object({
    id: z.uuidv4().describe('Detection ID'),
    imageHeight: z.int().min(0).describe('Image height in pixels'),
    imageWidth: z.int().min(0).describe('Image width in pixels'),
    boundingBoxX1: z.int().describe('Bounding box X1 coordinate'),
    boundingBoxX2: z.int().describe('Bounding box X2 coordinate'),
    boundingBoxY1: z.int().describe('Bounding box Y1 coordinate'),
    boundingBoxY2: z.int().describe('Bounding box Y2 coordinate'),
    sourceType: SourceTypeSchema.optional(),
  })
  .describe('Asset pet detection without pet')
  .meta({ id: 'AssetPetWithoutPetResponseDto' });

export const PetWithDetectionsResponseSchema = PetResponseSchema.extend({
  detections: z.array(AssetPetWithoutPetResponseSchema),
}).meta({ id: 'PetWithDetectionsResponseDto' });

const AssetPetResponseSchema = AssetPetWithoutPetResponseSchema.extend({
  pet: PetResponseSchema.nullable(),
}).meta({ id: 'AssetPetResponseDto' });

const AssetPetQuerySchema = z
  .object({
    assetId: z.uuidv4().describe('Asset ID to retrieve detections for'),
  })
  .meta({ id: 'AssetPetQueryDto' });

const ReassignPetDetectionSchema = z
  .object({
    petId: z.uuidv4().describe('Pet ID to assign this detection to'),
  })
  .meta({ id: 'ReassignPetDetectionDto' });

const AssetPetUpdateItemSchema = z
  .object({
    petId: z.uuidv4().describe('Target pet ID'),
    assetId: z.uuidv4().describe('Asset ID'),
  })
  .meta({ id: 'AssetPetUpdateItem' });

const AssetPetUpdateSchema = z
  .object({
    data: z.array(AssetPetUpdateItemSchema).describe('Detection reassignment items'),
  })
  .meta({ id: 'AssetPetUpdateDto' });

const AssetPetCreateSchema = AssetPetUpdateItemSchema.extend({
  imageWidth: z.int().describe('Image width in pixels'),
  imageHeight: z.int().describe('Image height in pixels'),
  x: z.int().describe('Detection bounding box X coordinate'),
  y: z.int().describe('Detection bounding box Y coordinate'),
  width: z.int().describe('Detection bounding box width'),
  height: z.int().describe('Detection bounding box height'),
}).meta({ id: 'AssetPetCreateDto' });

const AssetPetDeleteSchema = z
  .object({
    force: z.boolean().describe('Force delete even if pet has other detections'),
  })
  .meta({ id: 'AssetPetDeleteDto' });

const PetStatisticsResponseSchema = z
  .object({
    assets: z.int().describe('Number of assets containing this pet'),
  })
  .meta({ id: 'PetStatisticsResponseDto' });

export class PetCreateDto extends createZodDto(PetCreateSchema) {}
export class PetUpdateDto extends createZodDto(PetUpdateSchema) {}
export class PetsUpdateDto extends createZodDto(PetsUpdateSchema) {}
export class MergePetDto extends createZodDto(MergePetSchema) {}
export class PetSearchDto extends createZodDto(PetSearchSchema) {}
export class PetResponseDto extends createZodDto(PetResponseSchema) {}
export class PetsResponseDto extends createZodDto(PetsResponseSchema) {}
export class AssetPetWithoutPetResponseDto extends createZodDto(AssetPetWithoutPetResponseSchema) {}
export class PetWithDetectionsResponseDto extends createZodDto(PetWithDetectionsResponseSchema) {}
export class AssetPetResponseDto extends createZodDto(AssetPetResponseSchema) {}
export class AssetPetQueryDto extends createZodDto(AssetPetQuerySchema) {}
export class ReassignPetDetectionDto extends createZodDto(ReassignPetDetectionSchema) {}
export class AssetPetUpdateDto extends createZodDto(AssetPetUpdateSchema) {}
export class AssetPetCreateDto extends createZodDto(AssetPetCreateSchema) {}
export class AssetPetDeleteDto extends createZodDto(AssetPetDeleteSchema) {}
export class PetStatisticsResponseDto extends createZodDto(PetStatisticsResponseSchema) {}

export function mapPet(pet: MaybeDehydrated<Pet>): PetResponseDto {
  return {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    thumbnailPath: pet.thumbnailPath,
    isHidden: pet.isHidden,
    isFavorite: pet.isFavorite,
    color: pet.color ?? undefined,
    updatedAt: asDateString(pet.updatedAt),
  };
}

export function mapAssetPetWithoutPet(
  detection: MaybeDehydrated<Selectable<AssetPetTable>>,
): AssetPetWithoutPetResponseDto {
  return {
    id: detection.id,
    imageHeight: detection.imageHeight,
    imageWidth: detection.imageWidth,
    boundingBoxX1: detection.boundingBoxX1,
    boundingBoxX2: detection.boundingBoxX2,
    boundingBoxY1: detection.boundingBoxY1,
    boundingBoxY2: detection.boundingBoxY2,
    sourceType: detection.sourceType,
  };
}

export function mapAssetPet(detection: MaybeDehydrated<AssetPet>, auth: AuthDto): AssetPetResponseDto {
  return {
    ...mapAssetPetWithoutPet(detection),
    pet: detection.pet?.ownerId === auth.user.id ? mapPet(detection.pet) : null,
  };
}

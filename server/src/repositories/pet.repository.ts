import { Injectable } from '@nestjs/common';
import { ExpressionBuilder, Insertable, Kysely, Selectable, sql, Updateable } from 'kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { InjectKysely } from 'nestjs-kysely';
import { AssetPet } from 'src/database';
import { Chunked, ChunkedArray, DummyValue, GenerateSql } from 'src/decorators';
import { AssetFileType, AssetVisibility, SourceType } from 'src/enum';
import { DB } from 'src/schema';
import { AssetPetTable } from 'src/schema/tables/asset-pet.table';
import { PetSearchTable } from 'src/schema/tables/pet-search.table';
import { PetTable } from 'src/schema/tables/pet.table';
import { dummy, removeUndefinedKeys, withFilePath } from 'src/utils/database';
import { paginationHelper, PaginationOptions } from 'src/utils/pagination';

export interface PetSearchOptions {
  minimumDetectionCount: number;
  withHidden: boolean;
  closestDetectionId?: string;
}

export interface PetNameSearchOptions {
  withHidden?: boolean;
}

export interface PetNameResponse {
  id: string;
  name: string;
}

export interface AssetPetId {
  assetId: string;
  petId: string;
}

export interface UpdateDetectionsData {
  detectionIds?: string[];
  newPetId: string;
}

export interface PetStatistics {
  assets: number;
}

export interface DeleteDetectionsOptions {
  sourceType: SourceType;
}

export interface GetAllPetsOptions {
  ownerId?: string;
  thumbnailPath?: string;
  thumbnailAssetId?: string | null;
  isHidden?: boolean;
}

export interface GetAllDetectionsOptions {
  petId?: string | null;
  assetId?: string;
  sourceType?: SourceType;
}

export type UnassignDetectionsOptions = DeleteDetectionsOptions;

export type SelectDetectionOptions = (keyof Selectable<AssetPetTable>)[];

const withPet = (eb: ExpressionBuilder<DB, 'asset_pet'>) => {
  return jsonObjectFrom(
    eb.selectFrom('pet').selectAll('pet').whereRef('pet.id', '=', 'asset_pet.petId'),
  ).as('pet');
};

const withPetSearch = (eb: ExpressionBuilder<DB, 'asset_pet'>) => {
  return jsonObjectFrom(
    eb.selectFrom('pet_search').selectAll('pet_search').whereRef('pet_search.petId', '=', 'asset_pet.id'),
  ).as('petSearch');
};

@Injectable()
export class PetRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({ params: [{ detectionIds: [DummyValue.UUID], newPetId: DummyValue.UUID }] })
  async reassign({ detectionIds, newPetId }: UpdateDetectionsData): Promise<number> {
    const result = await this.db
      .updateTable('asset_pet')
      .set({ petId: newPetId })
      .$if(!!detectionIds, (qb) => qb.where('asset_pet.id', 'in', detectionIds!))
      .executeTakeFirst();

    return Number(result.numChangedRows ?? 0);
  }

  async unassignDetections({ sourceType }: UnassignDetectionsOptions): Promise<void> {
    await this.db
      .updateTable('asset_pet')
      .set({ petId: null })
      .where('asset_pet.sourceType', '=', sourceType)
      .execute();
  }

  @GenerateSql({ params: [[DummyValue.UUID]] })
  @Chunked()
  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.db.deleteFrom('pet').where('pet.id', 'in', ids).execute();
  }

  async deleteDetections({ sourceType }: DeleteDetectionsOptions): Promise<void> {
    await this.db.deleteFrom('asset_pet').where('asset_pet.sourceType', '=', sourceType).execute();
  }

  getAllDetections(options: GetAllDetectionsOptions = {}) {
    return this.db
      .selectFrom('asset_pet')
      .selectAll('asset_pet')
      .$if(options.petId === null, (qb) => qb.where('asset_pet.petId', 'is', null))
      .$if(!!options.petId, (qb) => qb.where('asset_pet.petId', '=', options.petId!))
      .$if(!!options.sourceType, (qb) => qb.where('asset_pet.sourceType', '=', options.sourceType!))
      .$if(!!options.assetId, (qb) => qb.where('asset_pet.assetId', '=', options.assetId!))
      .where('asset_pet.deletedAt', 'is', null)
      .where('asset_pet.isVisible', 'is', true)
      .stream();
  }

  getAll(options: GetAllPetsOptions = {}) {
    return this.db
      .selectFrom('pet')
      .selectAll('pet')
      .$if(!!options.ownerId, (qb) => qb.where('pet.ownerId', '=', options.ownerId!))
      .$if(options.thumbnailPath !== undefined, (qb) => qb.where('pet.thumbnailPath', '=', options.thumbnailPath!))
      .$if(options.thumbnailAssetId === null, (qb) => qb.where('pet.thumbnailAssetId', 'is', null))
      .$if(!!options.thumbnailAssetId, (qb) => qb.where('pet.thumbnailAssetId', '=', options.thumbnailAssetId!))
      .$if(options.isHidden !== undefined, (qb) => qb.where('pet.isHidden', '=', options.isHidden!))
      .stream();
  }

  @GenerateSql()
  getFileSamples() {
    return this.db
      .selectFrom('pet')
      .select(['id', 'thumbnailPath'])
      .where('thumbnailPath', '!=', sql.lit(''))
      .limit(sql.lit(3))
      .execute();
  }

  @GenerateSql({ params: [{ take: 1, skip: 0 }, DummyValue.UUID] })
  async getAllForUser(pagination: PaginationOptions, userId: string, options?: PetSearchOptions) {
    const items = await this.db
      .selectFrom('pet')
      .selectAll('pet')
      .innerJoin('asset_pet', 'asset_pet.petId', 'pet.id')
      .innerJoin('asset', (join) =>
        join
          .onRef('asset_pet.assetId', '=', 'asset.id')
          .on('asset.visibility', '=', sql.lit(AssetVisibility.Timeline))
          .on('asset.deletedAt', 'is', null),
      )
      .where('pet.ownerId', '=', userId)
      .where('asset_pet.deletedAt', 'is', null)
      .where('asset_pet.isVisible', 'is', true)
      .orderBy('pet.isHidden', 'asc')
      .orderBy('pet.isFavorite', 'desc')
      .having((eb) =>
        eb.or([
          eb('pet.name', '!=', ''),
          eb((innerEb) => innerEb.fn.count('asset_pet.assetId'), '>=', options?.minimumDetectionCount || 1),
        ]),
      )
      .groupBy('pet.id')
      .$if(!!options?.closestDetectionId, (qb) =>
        qb.orderBy((eb) =>
          eb(
            (eb) =>
              eb
                .selectFrom('pet_search')
                .select('pet_search.embedding')
                .whereRef('pet_search.petId', '=', 'pet.thumbnailAssetId'),
            '<=>',
            (eb) =>
              eb
                .selectFrom('pet_search')
                .select('pet_search.embedding')
                .where('pet_search.petId', '=', options!.closestDetectionId!),
          ),
        ),
      )
      .$if(!options?.closestDetectionId, (qb) =>
        qb
          .orderBy(sql`NULLIF(pet.name, '') is null`, 'asc')
          .orderBy((eb) => eb.fn.count('asset_pet.assetId'), 'desc')
          .orderBy(sql`NULLIF(pet.name, '')`, (om) => om.asc().nullsLast())
          .orderBy('pet.createdAt'),
      )
      .$if(!options?.withHidden, (qb) => qb.where('pet.isHidden', '=', false))
      .offset(pagination.skip ?? 0)
      .limit(pagination.take + 1)
      .execute();

    return paginationHelper(items, pagination.take);
  }

  @GenerateSql()
  getAllWithoutDetections() {
    return this.db
      .selectFrom('pet')
      .selectAll('pet')
      .leftJoin('asset_pet', 'asset_pet.petId', 'pet.id')
      .where('asset_pet.deletedAt', 'is', null)
      .where('asset_pet.isVisible', 'is', true)
      .having((eb) => eb.fn.count('asset_pet.assetId'), '=', 0)
      .groupBy('pet.id')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getDetectionsByAssetId(assetId: string, options?: { isVisible?: boolean }) {
    const isVisible = options === undefined ? true : options.isVisible;

    return this.db
      .selectFrom('asset_pet')
      .selectAll('asset_pet')
      .select(withPet)
      .where('asset_pet.assetId', '=', assetId)
      .where('asset_pet.deletedAt', 'is', null)
      .$if(isVisible !== undefined, (qb) => qb.where('asset_pet.isVisible', '=', isVisible!))
      .orderBy('asset_pet.boundingBoxX1', 'asc')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getDetectionById(id: string) {
    return this.db
      .selectFrom('asset_pet')
      .selectAll('asset_pet')
      .select(withPet)
      .where('asset_pet.id', '=', id)
      .where('asset_pet.deletedAt', 'is', null)
      .executeTakeFirstOrThrow();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getDetectionForRecognitionJob(id: string) {
    return this.db
      .selectFrom('asset_pet')
      .select(['asset_pet.id', 'asset_pet.petId', 'asset_pet.species'])
      .select((eb) =>
        jsonObjectFrom(
          eb
            .selectFrom('asset')
            .select(['asset.ownerId', 'asset.visibility', 'asset.fileCreatedAt'])
            .whereRef('asset.id', '=', 'asset_pet.assetId'),
        ).as('asset'),
      )
      .select(withPetSearch)
      .where('asset_pet.id', '=', id)
      .where('asset_pet.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getDataForThumbnailGenerationJob(id: string) {
    return this.db
      .selectFrom('pet')
      .innerJoin('asset_pet', 'asset_pet.id', 'pet.thumbnailAssetId')
      .innerJoin('asset', 'asset_pet.assetId', 'asset.id')
      .leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
      .select([
        'pet.ownerId',
        'asset_pet.boundingBoxX1 as x1',
        'asset_pet.boundingBoxY1 as y1',
        'asset_pet.boundingBoxX2 as x2',
        'asset_pet.boundingBoxY2 as y2',
        'asset_pet.imageWidth as oldWidth',
        'asset_pet.imageHeight as oldHeight',
        'asset.type',
        'asset.originalPath',
        'asset_exif.orientation as exifOrientation',
      ])
      .select((eb) => withFilePath(eb, AssetFileType.Preview).as('previewPath'))
      .where('pet.id', '=', id)
      .where('asset_pet.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  async reassignDetection(detectionId: string, newPetId: string): Promise<number> {
    const result = await this.db
      .updateTable('asset_pet')
      .set({ petId: newPetId })
      .where('asset_pet.id', '=', detectionId)
      .executeTakeFirst();

    return Number(result.numChangedRows ?? 0);
  }

  async reassignByPetId(sourcePetId: string, targetPetId: string): Promise<void> {
    await this.db
      .updateTable('asset_pet')
      .set({ petId: targetPetId })
      .where('asset_pet.petId', '=', sourcePetId)
      .execute();
  }

  getById(petId: string) {
    return this.db
      .selectFrom('pet')
      .selectAll('pet')
      .where('pet.id', '=', petId)
      .executeTakeFirst();
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.STRING, { withHidden: true }] })
  getByName(userId: string, petName: string, { withHidden }: PetNameSearchOptions) {
    return this.db
      .with('similarity_threshold', (db) =>
        db.selectNoFrom(sql`set_config('pg_trgm.word_similarity_threshold', '0.5', true)`.as('thresh')),
      )
      .selectFrom(['similarity_threshold', 'pet'])
      .selectAll('pet')
      .where('pet.ownerId', '=', userId)
      .where(() => sql`f_unaccent("pet"."name") %> f_unaccent(${petName})`)
      .orderBy(sql`f_unaccent("pet"."name") <->>> f_unaccent(${petName})`)
      .limit(100)
      .$if(!withHidden, (qb) => qb.where('pet.isHidden', '=', false))
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID, { withHidden: true }] })
  getDistinctNames(userId: string, { withHidden }: PetNameSearchOptions): Promise<PetNameResponse[]> {
    return this.db
      .selectFrom('pet')
      .select(['pet.id', 'pet.name'])
      .distinctOn((eb) => eb.fn('lower', ['pet.name']))
      .where((eb) => eb.and([eb('pet.ownerId', '=', userId), eb('pet.name', '!=', '')]))
      .$if(!withHidden, (qb) => qb.where('pet.isHidden', '=', false))
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async getStatistics(petId: string): Promise<PetStatistics> {
    const result = await this.db
      .selectFrom('asset_pet')
      .leftJoin('asset', (join) =>
        join
          .onRef('asset.id', '=', 'asset_pet.assetId')
          .on('asset.visibility', '=', sql.lit(AssetVisibility.Timeline))
          .on('asset.deletedAt', 'is', null),
      )
      .select((eb) => eb.fn.count(eb.fn('distinct', ['asset.id'])).as('count'))
      .where('asset_pet.deletedAt', 'is', null)
      .where('asset_pet.isVisible', 'is', true)
      .where('asset_pet.petId', '=', petId)
      .executeTakeFirst();

    return {
      assets: result ? Number(result.count) : 0,
    };
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getNumberOfPets(userId: string) {
    const zero = sql.lit(0);
    return this.db
      .selectFrom('pet')
      .where((eb) =>
        eb.exists((eb) =>
          eb
            .selectFrom('asset_pet')
            .whereRef('asset_pet.petId', '=', 'pet.id')
            .where('asset_pet.deletedAt', 'is', null)
            .where('asset_pet.isVisible', '=', true)
            .where((eb) =>
              eb.exists((eb) =>
                eb
                  .selectFrom('asset')
                  .whereRef('asset.id', '=', 'asset_pet.assetId')
                  .where('asset.visibility', '=', sql.lit(AssetVisibility.Timeline))
                  .where('asset.deletedAt', 'is', null),
              ),
            ),
        ),
      )
      .where('pet.ownerId', '=', userId)
      .select((eb) => eb.fn.coalesce(eb.fn.countAll<number>(), zero).as('total'))
      .select((eb) => eb.fn.coalesce(eb.fn.countAll<number>().filterWhere('isHidden', '=', true), zero).as('hidden'))
      .executeTakeFirstOrThrow();
  }

  create(pet: Insertable<PetTable>) {
    return this.db.insertInto('pet').values(pet).returningAll().executeTakeFirstOrThrow();
  }

  async createAll(pets: Insertable<PetTable>[]): Promise<string[]> {
    if (pets.length === 0) {
      return [];
    }

    const results = await this.db.insertInto('pet').values(pets).returningAll().execute();
    return results.map(({ id }) => id);
  }

  @GenerateSql({ params: [[], [], [{ petId: DummyValue.UUID, embedding: DummyValue.VECTOR }]] })
  async refreshDetections(
    toAdd: (Insertable<AssetPetTable> & { id: string })[],
    toRemove: string[],
    embeddings: PetSearchTable[],
  ): Promise<void> {
    let query = this.db;
    if (toAdd.length > 0) {
      (query as any) = query.with('added', (db) => db.insertInto('asset_pet').values(toAdd));
    }

    if (toRemove.length > 0) {
      (query as any) = query.with('removed', (db) =>
        db.deleteFrom('asset_pet').where('asset_pet.id', '=', (eb) => eb.fn.any(eb.val(toRemove))),
      );
    }

    if (embeddings.length > 0) {
      (query as any) = query.with('added_embeddings', (db) => db.insertInto('pet_search').values(embeddings));
    }

    await query.selectFrom(dummy).execute();
  }

  async update(pet: Updateable<PetTable> & { id: string }) {
    return this.db
      .updateTable('pet')
      .set(pet)
      .where('pet.id', '=', pet.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateAll(pets: Insertable<PetTable>[]): Promise<void> {
    if (pets.length === 0) {
      return;
    }

    await this.db
      .insertInto('pet')
      .values(pets)
      .onConflict((oc) =>
        oc.column('id').doUpdateSet((eb) =>
          removeUndefinedKeys(
            {
              name: eb.ref('excluded.name'),
              species: eb.ref('excluded.species'),
              thumbnailPath: eb.ref('excluded.thumbnailPath'),
              thumbnailAssetId: eb.ref('excluded.thumbnailAssetId'),
              isHidden: eb.ref('excluded.isHidden'),
              isFavorite: eb.ref('excluded.isFavorite'),
              color: eb.ref('excluded.color'),
            },
            pets[0],
          ),
        ),
      )
      .execute();
  }

  @GenerateSql({ params: [[{ assetId: DummyValue.UUID, petId: DummyValue.UUID }]] })
  @ChunkedArray()
  getDetectionsByIds(ids: AssetPetId[]) {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }

    const assetIds: string[] = [];
    const petIds: string[] = [];
    for (const { assetId, petId } of ids) {
      assetIds.push(assetId);
      petIds.push(petId);
    }

    return this.db
      .selectFrom('asset_pet')
      .selectAll('asset_pet')
      .select(withPet)
      .where('asset_pet.assetId', 'in', assetIds)
      .where('asset_pet.petId', 'in', petIds)
      .where('asset_pet.deletedAt', 'is', null)
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getRandomDetection(petId: string) {
    return this.db
      .selectFrom('asset_pet')
      .selectAll('asset_pet')
      .where('asset_pet.petId', '=', petId)
      .where('asset_pet.deletedAt', 'is', null)
      .where('asset_pet.isVisible', 'is', true)
      .executeTakeFirst();
  }

  @GenerateSql()
  async getLatestDetectionDate(): Promise<string | null> {
    const result = await this.db
      .selectFrom('asset_pet')
      .select((eb) => eb.fn.max('asset_pet.updatedAt').as('latest'))
      .executeTakeFirst();
    return result?.latest?.toISOString() ?? null;
  }

  async createDetection(detection: Insertable<AssetPetTable> & { id: string }) {
    return this.db.insertInto('asset_pet').values(detection).returningAll().executeTakeFirstOrThrow();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async deleteDetection(id: string): Promise<void> {
    await this.db.deleteFrom('asset_pet').where('asset_pet.id', '=', id).execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async softDeleteDetection(id: string): Promise<void> {
    await this.db.updateTable('asset_pet').set({ deletedAt: new Date() }).where('asset_pet.id', '=', id).execute();
  }

  async vacuum({ reindexVectors }: { reindexVectors: boolean }): Promise<void> {
    await sql`VACUUM ANALYZE asset_pet, pet_search, pet`.execute(this.db);
    await sql`REINDEX TABLE asset_pet`.execute(this.db);
    await sql`REINDEX TABLE pet`.execute(this.db);
    if (reindexVectors) {
      await sql`REINDEX TABLE pet_search`.execute(this.db);
    }
  }

  @GenerateSql({ params: [[DummyValue.UUID]] })
  @Chunked()
  getForPetsDelete(ids: string[]) {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.db.selectFrom('pet').select(['id', 'thumbnailPath']).where('id', 'in', ids).execute();
  }

  @GenerateSql({ params: [[], []] })
  async updateVisibility(visible: AssetPet[], hidden: AssetPet[]): Promise<void> {
    if (visible.length === 0 && hidden.length === 0) {
      return;
    }

    await this.db.transaction().execute(async (trx) => {
      if (visible.length > 0) {
        await trx
          .updateTable('asset_pet')
          .set({ isVisible: true })
          .where(
            'asset_pet.id',
            'in',
            visible.map(({ id }) => id),
          )
          .execute();
      }

      if (hidden.length > 0) {
        await trx
          .updateTable('asset_pet')
          .set({ isVisible: false })
          .where(
            'asset_pet.id',
            'in',
            hidden.map(({ id }) => id),
          )
          .execute();
      }
    });
  }

  @GenerateSql({ params: [{ petId: DummyValue.UUID, assetId: DummyValue.UUID }] })
  getForThumbnailAssetUpdate({ petId, assetId }: { petId: string; assetId: string }) {
    return this.db
      .selectFrom('asset_pet')
      .select('asset_pet.id')
      .where('asset_pet.assetId', '=', assetId)
      .where('asset_pet.petId', '=', petId)
      .innerJoin('asset', (join) => join.onRef('asset.id', '=', 'asset_pet.assetId').on('asset.isOffline', '=', false))
      .executeTakeFirst();
  }
}

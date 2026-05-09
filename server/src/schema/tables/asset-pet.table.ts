import {
  AfterDeleteTrigger,
  Column,
  DeleteDateColumn,
  ForeignKeyColumn,
  Generated,
  Index,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { SourceType } from 'src/enum';
import { asset_face_source_type } from 'src/schema/enums';
import { asset_pet_audit } from 'src/schema/functions';
import { AssetTable } from 'src/schema/tables/asset.table';
import { PetTable } from 'src/schema/tables/pet.table';

@Table({ name: 'asset_pet' })
@UpdatedAtTrigger('asset_pet_updatedAt')
@AfterDeleteTrigger({
  scope: 'statement',
  function: asset_pet_audit,
  referencingOldTableAs: 'old',
  when: 'pg_trigger_depth() = 0',
})
// schemaFromDatabase does not preserve column order
@Index({ name: 'asset_pet_assetId_petId_idx', columns: ['assetId', 'petId'] })
@Index({
  name: 'asset_pet_petId_assetId_notDeleted_isVisible_idx',
  columns: ['petId', 'assetId'],
  where: '"deletedAt" IS NULL AND "isVisible" IS TRUE',
})
@Index({ columns: ['petId', 'assetId'] })
export class AssetPetTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => AssetTable, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    // [assetId, petId] is the PK constraint
    index: false,
  })
  assetId!: string;

  @ForeignKeyColumn(() => PetTable, {
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
    nullable: true,
    // [petId, assetId] makes this redundant
    index: false,
  })
  petId!: string | null;

  @Column({ default: 0, type: 'integer' })
  imageWidth!: Generated<number>;

  @Column({ default: 0, type: 'integer' })
  imageHeight!: Generated<number>;

  @Column({ default: 0, type: 'integer' })
  boundingBoxX1!: Generated<number>;

  @Column({ default: 0, type: 'integer' })
  boundingBoxY1!: Generated<number>;

  @Column({ default: 0, type: 'integer' })
  boundingBoxX2!: Generated<number>;

  @Column({ default: 0, type: 'integer' })
  boundingBoxY2!: Generated<number>;

  @Column({ default: SourceType.MachineLearning, enum: asset_face_source_type })
  sourceType!: Generated<SourceType>;

  @Column({ default: '' })
  species!: Generated<string>;

  @DeleteDateColumn()
  deletedAt!: Timestamp | null;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @UpdateIdColumn()
  updateId!: Generated<string>;

  @Column({ type: 'boolean', default: true })
  isVisible!: Generated<boolean>;
}

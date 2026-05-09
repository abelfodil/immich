import {
  AfterDeleteTrigger,
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Index,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { pet_delete_audit } from 'src/schema/functions';
import { AssetPetTable } from 'src/schema/tables/asset-pet.table';
import { UserTable } from 'src/schema/tables/user.table';

@Table('pet')
@Index({
  name: 'idx_pet_name_trigram',
  using: 'gin',
  expression: 'f_unaccent("name") gin_trgm_ops',
})
@UpdatedAtTrigger('pet_updatedAt')
@AfterDeleteTrigger({
  scope: 'statement',
  function: pet_delete_audit,
  referencingOldTableAs: 'old',
  when: 'pg_trigger_depth() = 0',
})
export class PetTable {
  @PrimaryGeneratedColumn('uuid')
  id!: Generated<string>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false })
  ownerId!: string;

  @Column({ default: '' })
  name!: Generated<string>;

  @Column({ default: '' })
  thumbnailPath!: Generated<string>;

  @Column({ type: 'boolean', default: false })
  isHidden!: Generated<boolean>;

  @Column({ type: 'boolean', default: false })
  isFavorite!: Generated<boolean>;

  @Column({ type: 'character varying', nullable: true, default: null })
  color!: string | null;

  @Column({ default: '' })
  species!: Generated<string>;

  @ForeignKeyColumn(() => AssetPetTable, { onDelete: 'SET NULL', nullable: true })
  thumbnailAssetId!: string | null;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;
}

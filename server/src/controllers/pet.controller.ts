import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Next,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NextFunction, Response } from 'express';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { BulkIdResponseDto, BulkIdsDto } from 'src/dtos/asset-ids.response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  AssetPetCreateDto,
  AssetPetDeleteDto,
  AssetPetQueryDto,
  AssetPetResponseDto,
  AssetPetUpdateDto,
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
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated, FileResponse } from 'src/middleware/auth.guard';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PetService } from 'src/services/pet.service';
import { sendFile } from 'src/utils/file';
import { UUIDParamDto } from 'src/validation';

@ApiTags(ApiTag.Pets)
@Controller('pets')
export class PetController {
  constructor(
    private service: PetService,
    private logger: LoggingRepository,
  ) {
    this.logger.setContext(PetController.name);
  }

  @Get()
  @Authenticated({ permission: Permission.PetRead })
  @Endpoint({
    summary: 'Get all pets',
    description: 'Retrieve a list of all pets.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  getAllPets(@Auth() auth: AuthDto, @Query() dto: PetSearchDto): Promise<PetsResponseDto> {
    return this.service.getAll(auth, dto);
  }

  @Post()
  @Authenticated({ permission: Permission.PetCreate })
  @Endpoint({
    summary: 'Create a pet',
    description: 'Create a new pet that can have multiple detections assigned to it.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  createPet(@Auth() auth: AuthDto, @Body() dto: PetCreateDto): Promise<PetResponseDto> {
    return this.service.create(auth, dto);
  }

  @Put()
  @Authenticated({ permission: Permission.PetUpdate })
  @Endpoint({
    summary: 'Update pets',
    description: 'Bulk update multiple pets at once.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  updatePets(@Auth() auth: AuthDto, @Body() dto: PetsUpdateDto): Promise<BulkIdResponseDto[]> {
    return this.service.updateAll(auth, dto);
  }

  @Delete()
  @Authenticated({ permission: Permission.PetDelete })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Delete pets',
    description: 'Bulk delete a list of pets at once.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  deletePets(@Auth() auth: AuthDto, @Body() dto: BulkIdsDto): Promise<void> {
    return this.service.deleteAll(auth, dto);
  }

  @Post('detections')
  @Authenticated({ permission: Permission.PetCreate })
  @Endpoint({
    summary: 'Create a pet detection',
    description:
      'Create a new detection that has not been discovered by pet recognition. The content of the bounding box is considered a detection.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  createDetection(@Auth() auth: AuthDto, @Body() dto: AssetPetCreateDto): Promise<AssetPetResponseDto> {
    return this.service.createDetection(auth, dto);
  }

  @Get('detections')
  @Authenticated({ permission: Permission.PetRead })
  @Endpoint({
    summary: 'Get pet detections for an asset',
    description: 'Retrieve all pet detections belonging to an asset.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  getDetections(@Auth() auth: AuthDto, @Query() dto: AssetPetQueryDto): Promise<AssetPetResponseDto[]> {
    return this.service.getDetectionsByAssetId(auth, dto);
  }

  @Put('detections/:id')
  @Authenticated({ permission: Permission.PetReassign })
  @Endpoint({
    summary: 'Reassign a detection to a different pet',
    description: 'Re-assign the detection identified by the id in the path to the pet specified in the body.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  reassignDetection(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: ReassignPetDetectionDto,
  ): Promise<PetResponseDto> {
    return this.service.reassignDetectionById(auth, id, dto);
  }

  @Delete('detections/:id')
  @Authenticated({ permission: Permission.PetDelete })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Delete a pet detection',
    description: 'Delete a pet detection identified by the id. Optionally can be force deleted.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  deleteDetection(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto, @Body() dto: AssetPetDeleteDto): Promise<void> {
    return this.service.deleteDetection(auth, id, dto);
  }

  @Get(':id')
  @Authenticated({ permission: Permission.PetRead })
  @Endpoint({
    summary: 'Get a pet',
    description: 'Retrieve a pet by id.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  getPet(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<PetResponseDto> {
    return this.service.getById(auth, id);
  }

  @Put(':id')
  @Authenticated({ permission: Permission.PetUpdate })
  @Endpoint({
    summary: 'Update a pet',
    description: 'Update an individual pet.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  updatePet(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto, @Body() dto: PetUpdateDto): Promise<PetResponseDto> {
    return this.service.update(auth, id, dto);
  }

  @Delete(':id')
  @Authenticated({ permission: Permission.PetDelete })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Delete a pet',
    description: 'Delete an individual pet.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  deletePet(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<void> {
    return this.service.delete(auth, id);
  }

  @Get(':id/statistics')
  @Authenticated({ permission: Permission.PetStatistics })
  @Endpoint({
    summary: 'Get pet statistics',
    description: 'Retrieve statistics about a specific pet.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  getPetStatistics(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<PetStatisticsResponseDto> {
    return this.service.getStatistics(auth, id);
  }

  @Get(':id/thumbnail')
  @FileResponse()
  @Authenticated({ permission: Permission.PetRead })
  @Endpoint({
    summary: 'Get pet thumbnail',
    description: 'Retrieve the thumbnail file for a pet.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  async getPetThumbnail(
    @Res() res: Response,
    @Next() next: NextFunction,
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
  ) {
    await sendFile(res, next, () => this.service.getThumbnail(auth, id), this.logger);
  }

  @Put(':id/reassign')
  @Authenticated({ permission: Permission.PetReassign })
  @Endpoint({
    summary: 'Reassign pet detections',
    description: 'Bulk reassign a list of detections to a different pet.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  reassignDetections(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AssetPetUpdateDto,
  ): Promise<PetResponseDto[]> {
    return this.service.reassignDetections(auth, id, dto);
  }

  @Post(':id/merge')
  @Authenticated({ permission: Permission.PetMerge })
  @HttpCode(HttpStatus.OK)
  @Endpoint({
    summary: 'Merge pets',
    description: 'Merge a list of pets into the pet specified in the path parameter.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  mergePet(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: MergePetDto,
  ): Promise<BulkIdResponseDto[]> {
    return this.service.mergePet(auth, id, dto);
  }
}

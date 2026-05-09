<script lang="ts">
  import { shortcut } from '$lib/actions/shortcut';
  import { timeBeforeShowLoadingSpinner } from '$lib/constants';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { getPetsThumbnailUrl, handlePromiseError } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { zoomImageToBase64 } from '$lib/utils/people-utils';
  import {
    AssetTypeEnum,
    deletePetDetection,
    getPetDetections,
    reassignPetDetection,
    type AssetFaceResponseDto,
    type AssetPetResponseDto,
    type PetResponseDto,
  } from '@immich/sdk';
  import { Icon, IconButton, LoadingSpinner, modalManager, toastManager } from '@immich/ui';
  import { mdiArrowLeftThin, mdiPawOff, mdiPencil, mdiRestart, mdiTrashCan } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { linear } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import ImageThumbnail from '../assets/thumbnail/ImageThumbnail.svelte';
  import AssignPetSidePanel from './AssignPetSidePanel.svelte';

  interface Props {
    assetId: string;
    assetType: AssetTypeEnum;
    onClose: () => void;
    onRefresh: () => Promise<void>;
  }

  let { assetId, assetType, onClose, onRefresh }: Props = $props();

  let detectionsWithPets: AssetPetResponseDto[] = $state([]);
  let selectedPetToReassign: Record<string, PetResponseDto> = $state({});
  let editedDetection: AssetPetResponseDto | undefined = $state();

  let isShowLoadingDetections = $state(false);
  let isShowLoadingDone = $state(false);
  let showAssignPanel = $state(false);

  const thumbnailWidth = '90px';

  async function loadDetections() {
    const timeout = setTimeout(() => (isShowLoadingDetections = true), timeBeforeShowLoadingSpinner);
    try {
      detectionsWithPets = await getPetDetections({ assetId });
    } catch (error) {
      handleError(error, $t('errors.failed_to_load_pets'));
    } finally {
      clearTimeout(timeout);
    }
    isShowLoadingDetections = false;
  }

  onMount(() => {
    handlePromiseError(loadDetections());
  });

  const handleReset = (id: string) => {
    if (selectedPetToReassign[id]) {
      delete selectedPetToReassign[id];
      selectedPetToReassign = { ...selectedPetToReassign };
    }
  };

  const handleEditDetections = async () => {
    const timeout = setTimeout(() => (isShowLoadingDone = true), timeBeforeShowLoadingSpinner);
    const numberOfChanges = Object.keys(selectedPetToReassign).length;

    if (numberOfChanges > 0) {
      try {
        for (const detection of detectionsWithPets) {
          const pet = selectedPetToReassign[detection.id];
          if (pet) {
            await reassignPetDetection({ id: detection.id, reassignPetDetectionDto: { petId: pet.id } });
          }
        }
        toastManager.primary($t('people_edits_count', { values: { count: numberOfChanges } }));
      } catch (error) {
        handleError(error, $t('errors.cant_apply_changes'));
      }
    }

    clearTimeout(timeout);
    isShowLoadingDone = false;
    onRefresh();
  };

  const handleReassignDetection = (pet: PetResponseDto | null) => {
    if (pet && editedDetection) {
      selectedPetToReassign = { ...selectedPetToReassign, [editedDetection.id]: pet };
    }
    showAssignPanel = false;
  };

  const handleDetectionPicker = (detection: AssetPetResponseDto) => {
    editedDetection = detection;
    showAssignPanel = true;
  };

  const deleteDetection = async (detection: AssetPetResponseDto) => {
    try {
      const name = detection.pet?.name || detection.pet?.species || $t('unnamed_pet');
      const isConfirmed = await modalManager.showDialog({
        prompt: $t('confirm_delete_face', { values: { name } }),
      });
      if (!isConfirmed) {
        return;
      }
      await deletePetDetection({ id: detection.id, assetPetDeleteDto: { force: false } });
      detectionsWithPets = detectionsWithPets.filter((d) => d.id !== detection.id);
      await onRefresh();
    } catch (error) {
      handleError(error, $t('errors.unable_to_hide_pet'));
    }
  };
</script>

<svelte:document
  use:shortcut={{
    shortcut: { key: 'Escape' },
    onShortcut: () => {
      if (showAssignPanel) {
        showAssignPanel = false;
      } else {
        onClose();
      }
    },
  }}
/>

<section
  transition:fly={{ x: 360, duration: 100, easing: linear }}
  class="absolute top-0 h-full w-90 overflow-x-hidden bg-light p-2 dark:text-immich-dark-fg"
>
  <div class="flex place-items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <IconButton
        shape="round"
        color="secondary"
        variant="ghost"
        icon={mdiArrowLeftThin}
        aria-label={$t('back')}
        onclick={onClose}
      />
      <p class="flex text-lg text-immich-fg dark:text-immich-dark-fg">{$t('edit_pets')}</p>
    </div>
    {#if !isShowLoadingDone}
      <button
        type="button"
        class="justify-self-end rounded-lg p-2 hover:bg-immich-dark-primary hover:dark:bg-immich-dark-primary/50"
        onclick={handleEditDetections}
      >
        {$t('done')}
      </button>
    {:else}
      <LoadingSpinner />
    {/if}
  </div>

  <div class="p-4 text-sm">
    <div class="mt-4 flex flex-wrap gap-2">
      {#if isShowLoadingDetections}
        <div class="flex w-full justify-center">
          <LoadingSpinner />
        </div>
      {:else}
        {#each detectionsWithPets as detection, index (detection.id)}
          {@const petName = detection.pet
            ? detection.pet.name || detection.pet.species || $t('unnamed_pet')
            : $t('face_unassigned')}
          {@const isHighlighted = assetViewerManager.highlightedFaces.some((b) => b.id === detection.id)}
          <div class="relative h-29 w-24">
            <div
              role="button"
              tabindex={index}
              class="absolute inset-s-0 top-0 size-22.5 cursor-default"
              onfocus={() => assetViewerManager.setHighlightedFaces([detectionsWithPets[index]])}
              onpointerenter={() => assetViewerManager.setHighlightedFaces([detectionsWithPets[index]])}
              onpointerleave={() => assetViewerManager.clearHighlightedFaces()}
            >
              <div class="relative">
                {#if selectedPetToReassign[detection.id]}
                  <ImageThumbnail
                    curve
                    shadow
                    highlighted={isHighlighted}
                    url={getPetsThumbnailUrl(selectedPetToReassign[detection.id])}
                    altText={selectedPetToReassign[detection.id].name || selectedPetToReassign[detection.id].species}
                    title={selectedPetToReassign[detection.id].name || selectedPetToReassign[detection.id].species}
                    widthStyle={thumbnailWidth}
                    heightStyle={thumbnailWidth}
                  />
                {:else if detection.pet}
                  <ImageThumbnail
                    curve
                    shadow
                    highlighted={isHighlighted}
                    url={getPetsThumbnailUrl(detection.pet)}
                    altText={detection.pet.name || detection.pet.species}
                    title={detection.pet.name || detection.pet.species}
                    widthStyle={thumbnailWidth}
                    heightStyle={thumbnailWidth}
                  />
                {:else}
                  {#await zoomImageToBase64(detection as unknown as AssetFaceResponseDto, assetId, assetType, assetViewerManager.imgRef)}
                    <ImageThumbnail
                      curve
                      shadow
                      highlighted={isHighlighted}
                      url="/src/lib/assets/no-thumbnail.png"
                      altText={$t('face_unassigned')}
                      title={$t('face_unassigned')}
                      widthStyle={thumbnailWidth}
                      heightStyle={thumbnailWidth}
                    />
                  {:then data}
                    <ImageThumbnail
                      curve
                      shadow
                      highlighted={isHighlighted}
                      url={data === null ? '/src/lib/assets/no-thumbnail.png' : data}
                      altText={$t('face_unassigned')}
                      title={$t('face_unassigned')}
                      widthStyle={thumbnailWidth}
                      heightStyle={thumbnailWidth}
                    />
                  {/await}
                {/if}
              </div>

              <p class="relative mt-1 truncate font-medium" title={petName}>
                {#if selectedPetToReassign[detection.id]}
                  {selectedPetToReassign[detection.id].name ||
                    selectedPetToReassign[detection.id].species ||
                    $t('unnamed_pet')}
                {:else}
                  <span class={petName === $t('face_unassigned') ? 'dark:text-gray-500' : ''}>{petName}</span>
                {/if}
              </p>

              <div class="absolute inset-e-[-3px] top-[-3px] size-5 rounded-full">
                {#if selectedPetToReassign[detection.id]}
                  <IconButton
                    shape="round"
                    variant="ghost"
                    color="primary"
                    icon={mdiRestart}
                    aria-label={$t('reset')}
                    size="small"
                    class="absolute inset-s-1/2 top-1/2 translate-[-50%] transform"
                    onclick={() => handleReset(detection.id)}
                  />
                {:else}
                  <IconButton
                    shape="round"
                    color="primary"
                    icon={mdiPencil}
                    aria-label={$t('select_new_face')}
                    size="small"
                    class="absolute inset-s-1/2 top-1/2 translate-[-50%] transform"
                    onclick={() => handleDetectionPicker(detection)}
                  />
                {/if}
              </div>

              <div class="absolute inset-e-8 top-[-3px] size-5 rounded-full">
                {#if !selectedPetToReassign[detection.id] && !detection.pet}
                  <div
                    class="absolute inset-s-1/2 top-1/2 flex translate-[-50%] transform place-content-center place-items-center rounded-full bg-[#d3d3d3] p-1 transition-all"
                  >
                    <Icon color="primary" icon={mdiPawOff} aria-hidden size="24" />
                  </div>
                {/if}
              </div>

              {#if detection.pet != null && !selectedPetToReassign[detection.id]}
                <div class="absolute inset-e-[-3px] top-8 size-5 rounded-full">
                  <IconButton
                    shape="round"
                    color="danger"
                    icon={mdiTrashCan}
                    aria-label={$t('delete_face')}
                    size="small"
                    class="absolute inset-s-1/2 top-1/2 translate-[-50%] transform"
                    onclick={() => deleteDetection(detection)}
                  />
                </div>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</section>

{#if showAssignPanel && editedDetection}
  <AssignPetSidePanel
    currentPetId={editedDetection.pet?.id}
    onClose={() => (showAssignPanel = false)}
    onReassign={handleReassignDetection}
  />
{/if}

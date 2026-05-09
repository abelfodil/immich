<script lang="ts">
  import { timeBeforeShowLoadingSpinner } from '$lib/constants';
  import { handleError } from '$lib/utils/handle-error';
  import { getPetsThumbnailUrl } from '$lib/utils';
  import { getAllPets, createPet, reassignPetDetections, type PetResponseDto, type AssetPetUpdateItem } from '@immich/sdk';
  import { Button, toastManager } from '@immich/ui';
  import { mdiMerge, mdiPlus } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { quintOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import ControlAppBar from '$lib/components/shared-components/ControlAppBar.svelte';
  import ImageThumbnail from '$lib/components/assets/thumbnail/ImageThumbnail.svelte';

  interface Props {
    assetIds: string[];
    pet: PetResponseDto;
    onConfirm: () => void;
    onClose: () => void;
  }

  let { assetIds, pet, onConfirm, onClose }: Props = $props();

  let pets: PetResponseDto[] = $state([]);
  let selectedPet: PetResponseDto | null = $state(null);
  let disableButtons = $state(false);
  let showLoadingSpinnerCreate = $state(false);
  let showLoadingSpinnerReassign = $state(false);
  let screenHeight: number = $state(0);

  const detections: AssetPetUpdateItem[] = assetIds.map((assetId) => ({ assetId, petId: pet.id }));

  onMount(async () => {
    const data = await getAllPets({ withHidden: false });
    pets = data.pets.filter((p) => p.id !== pet.id);
  });

  const handleSelectPet = (p: PetResponseDto) => {
    selectedPet = selectedPet?.id === p.id ? null : p;
  };

  const handleCreate = async () => {
    const timeout = setTimeout(() => (showLoadingSpinnerCreate = true), timeBeforeShowLoadingSpinner);
    try {
      disableButtons = true;
      const newPet = await createPet({ petCreateDto: {} });
      await reassignPetDetections({ id: newPet.id, assetPetUpdateDto: { data: detections } });
      toastManager.primary($t('reassigned_assets_to_new_pet', { values: { count: assetIds.length } }));
    } catch (error) {
      handleError(error, $t('errors.unable_to_reassign_assets_new_pet'));
    } finally {
      clearTimeout(timeout);
      showLoadingSpinnerCreate = false;
    }
    onConfirm();
  };

  const handleReassign = async () => {
    if (!selectedPet) return;
    const timeout = setTimeout(() => (showLoadingSpinnerReassign = true), timeBeforeShowLoadingSpinner);
    try {
      disableButtons = true;
      await reassignPetDetections({ id: selectedPet.id, assetPetUpdateDto: { data: detections } });
      toastManager.primary(
        $t('reassigned_assets_to_existing_pet', {
          values: { count: assetIds.length, name: selectedPet.name || null },
        }),
      );
    } catch (error) {
      handleError(error, $t('errors.unable_to_reassign_assets_existing_pet', { values: { name: selectedPet?.name || null } }));
    } finally {
      clearTimeout(timeout);
      showLoadingSpinnerReassign = false;
    }
    onConfirm();
  };
</script>

<svelte:window bind:innerHeight={screenHeight} />

<section
  transition:fly={{ y: 500, duration: 100, easing: quintOut }}
  class="absolute inset-s-0 top-0 size-full bg-light"
>
  <ControlAppBar {onClose}>
    {#snippet leading()}
      <div></div>
    {/snippet}
    {#snippet trailing()}
      <div class="flex gap-4">
        <Button
          shape="round"
          leadingIcon={mdiPlus}
          loading={showLoadingSpinnerCreate}
          size="small"
          disabled={disableButtons || !!selectedPet}
          onclick={handleCreate}
        >
          {$t('create_new_pet')}
        </Button>
        <Button
          size="small"
          shape="round"
          leadingIcon={mdiMerge}
          loading={showLoadingSpinnerReassign}
          disabled={disableButtons || !selectedPet}
          onclick={handleReassign}
        >
          {$t('reassign')}
        </Button>
      </div>
    {/snippet}
  </ControlAppBar>

  <section class="px-17.5 pt-25">
    {#if selectedPet}
      <div class="mb-10 flex place-content-center place-items-center gap-4">
        <button type="button" onclick={() => (selectedPet = null)} class="flex flex-col items-center gap-2">
          <ImageThumbnail
            circle
            shadow
            border
            url={getPetsThumbnailUrl(selectedPet)}
            altText={selectedPet.name || selectedPet.species}
            widthStyle="7rem"
            heightStyle="7rem"
          />
          <span class="text-sm text-primary">{selectedPet.name || selectedPet.species}</span>
        </button>
      </div>
    {/if}

    <div
      class="mt-6 overflow-y-auto rounded-3xl bg-gray-200 p-10 immich-scrollbar dark:bg-immich-dark-gray"
      style:max-height="{screenHeight - 400}px"
    >
      <div class="grid grid-cols-3 gap-8 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {#each pets as p (p.id)}
          <button
            type="button"
            class="flex flex-col items-center gap-1"
            class:opacity-50={selectedPet && selectedPet.id !== p.id}
            onclick={() => handleSelectPet(p)}
          >
            <ImageThumbnail
              circle
              shadow
              border={selectedPet?.id === p.id}
              url={getPetsThumbnailUrl(p)}
              altText={p.name || p.species}
              widthStyle="4rem"
              heightStyle="4rem"
            />
            <span class="max-w-full truncate text-xs text-primary">{p.name || p.species}</span>
          </button>
        {/each}
      </div>
    </div>
  </section>
</section>

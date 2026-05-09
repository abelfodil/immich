<script lang="ts">
  import { timeBeforeShowLoadingSpinner } from '$lib/constants';
  import { getPetsThumbnailUrl, handlePromiseError } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { createPet, getAllPets, type PetResponseDto } from '@immich/sdk';
  import { IconButton, LoadingSpinner } from '@immich/ui';
  import { mdiArrowLeftThin, mdiClose, mdiMagnify, mdiPlus } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { linear } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import ImageThumbnail from '../assets/thumbnail/ImageThumbnail.svelte';

  interface Props {
    currentPetId?: string | null;
    onClose: () => void;
    onReassign: (pet: PetResponseDto) => void;
  }

  let { currentPetId, onClose, onReassign }: Props = $props();

  let allPets: PetResponseDto[] = $state([]);
  let isShowLoadingPets = $state(false);
  let isShowLoadingNewPet = $state(false);
  let searchName = $state('');
  let searchMode = $state(false);

  let showPets = $derived(
    searchName
      ? allPets.filter((p) => (p.name || p.species || '').toLowerCase().includes(searchName.toLowerCase()))
      : allPets.filter((p) => !p.isHidden),
  );

  async function loadPets() {
    const timeout = setTimeout(() => (isShowLoadingPets = true), timeBeforeShowLoadingSpinner);
    try {
      const { pets } = await getAllPets({ withHidden: true });
      allPets = pets;
    } catch (error) {
      handleError(error, $t('errors.failed_to_load_pets'));
    } finally {
      clearTimeout(timeout);
    }
    isShowLoadingPets = false;
  }

  const handleCreatePet = async () => {
    const timeout = setTimeout(() => (isShowLoadingNewPet = true), timeBeforeShowLoadingSpinner);
    try {
      const newPet = await createPet({ petCreateDto: {} });
      onReassign(newPet);
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_name'));
    } finally {
      clearTimeout(timeout);
      isShowLoadingNewPet = false;
    }
  };

  onMount(() => {
    handlePromiseError(loadPets());
  });
</script>

<section
  transition:fly={{ x: 360, duration: 100, easing: linear }}
  class="absolute top-0 h-full w-90 overflow-x-hidden bg-light p-2 dark:text-immich-dark-fg"
>
  <div class="flex place-items-center justify-between gap-2">
    {#if !searchMode}
      <div class="flex items-center gap-2">
        <IconButton
          color="secondary"
          variant="ghost"
          shape="round"
          icon={mdiArrowLeftThin}
          aria-label={$t('back')}
          onclick={onClose}
        />
        <p class="flex text-lg text-immich-fg dark:text-immich-dark-fg">{$t('select_pet')}</p>
      </div>
      <div class="flex justify-end gap-2">
        <IconButton
          color="secondary"
          variant="ghost"
          shape="round"
          icon={mdiMagnify}
          aria-label={$t('search_pets')}
          onclick={() => (searchMode = true)}
        />
        {#if !isShowLoadingNewPet}
          <IconButton
            color="secondary"
            variant="ghost"
            shape="round"
            icon={mdiPlus}
            aria-label={$t('create_new_pet')}
            onclick={handleCreatePet}
          />
        {:else}
          <div class="flex place-content-center place-items-center">
            <LoadingSpinner />
          </div>
        {/if}
      </div>
    {:else}
      <IconButton
        color="secondary"
        variant="ghost"
        shape="round"
        icon={mdiArrowLeftThin}
        aria-label={$t('back')}
        onclick={() => (searchMode = false)}
      />
      <div class="flex w-full px-2">
        <input
          type="search"
          class="w-full rounded-full border border-gray-300 bg-white py-2 px-4 text-sm placeholder-gray-400 dark:border-gray-600 dark:bg-immich-dark-gray dark:text-white"
          placeholder={$t('search_pets')}
          bind:value={searchName}
          autofocus
        />
      </div>
      <IconButton
        color="secondary"
        variant="ghost"
        shape="round"
        icon={mdiClose}
        aria-label={$t('cancel_search')}
        onclick={() => {
          searchMode = false;
          searchName = '';
        }}
      />
    {/if}
  </div>

  <div class="p-4 text-sm">
    <h2 class="mt-4 mb-8">{$t('all_pets')}</h2>
    {#if isShowLoadingPets}
      <div class="flex w-full justify-center">
        <LoadingSpinner />
      </div>
    {:else}
      <div class="mt-4 flex flex-wrap gap-2 overflow-y-auto immich-scrollbar">
        {#each showPets as pet (pet.id)}
          {#if pet.id !== currentPetId}
            <div class="w-fit">
              <button type="button" class="w-22.5" onclick={() => onReassign(pet)}>
                <ImageThumbnail
                  curve
                  shadow
                  url={getPetsThumbnailUrl(pet)}
                  altText={pet.name || pet.species || $t('unnamed_pet')}
                  title={pet.name || pet.species || $t('unnamed_pet')}
                  widthStyle="90px"
                  heightStyle="90px"
                />
                <p class="mt-1 truncate font-medium" title={pet.name || pet.species}>
                  {pet.name || pet.species || $t('unnamed_pet')}
                </p>
              </button>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</section>

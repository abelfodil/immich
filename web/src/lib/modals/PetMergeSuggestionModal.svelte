<script lang="ts">
  import { getPetsThumbnailUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { mergePet, type PetResponseDto } from '@immich/sdk';
  import { FormModal, Icon, IconButton, toastManager } from '@immich/ui';
  import { mdiArrowLeft, mdiCallMerge, mdiSwapHorizontal } from '@mdi/js';
  import { onMount, tick } from 'svelte';
  import { t } from 'svelte-i18n';
  import ImageThumbnail from '../components/assets/thumbnail/ImageThumbnail.svelte';

  type Props = {
    petToMerge: PetResponseDto;
    petToBeMergedInto: PetResponseDto;
    potentialMergePets: PetResponseDto[];
    onClose: (pets?: [PetResponseDto, PetResponseDto]) => void;
  };

  let {
    petToMerge = $bindable(),
    petToBeMergedInto = $bindable(),
    potentialMergePets = $bindable(),
    onClose,
  }: Props = $props();

  let choosePetToMerge = $state(false);

  const title = petToBeMergedInto.name;

  const changePetToMerge = (newPet: PetResponseDto) => {
    const index = potentialMergePets.indexOf(newPet);
    [potentialMergePets[index], petToBeMergedInto] = [petToBeMergedInto, potentialMergePets[index]];
    choosePetToMerge = false;
  };

  const onSubmit = async () => {
    try {
      await mergePet({
        id: petToBeMergedInto.id,
        mergePetDto: { ids: [petToMerge.id] },
      });
      toastManager.primary($t('merge_pets_successfully'));
      onClose([petToMerge, petToBeMergedInto]);
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_name'));
    }
  };

  onMount(async () => {
    await tick();
    document.querySelector<HTMLElement>('#merge-confirm-button')?.focus();
  });
</script>

<FormModal
  title="{$t('merge_pets')} - {title}"
  submitColor="primary"
  submitText={$t('yes')}
  cancelText={$t('no')}
  {onClose}
  {onSubmit}
>
  <div class="flex items-center justify-center gap-2 py-4 md:h-36">
    {#if !choosePetToMerge}
      <div class="flex size-20 items-center px-1 md:size-24 md:px-2">
        <ImageThumbnail
          circle
          shadow
          url={getPetsThumbnailUrl(petToMerge)}
          altText={petToMerge.name}
          widthStyle="100%"
        />
      </div>

      <div class="grid grid-rows-3">
        <div></div>
        <div class="flex h-full flex-col items-center justify-center">
          <div class="flex h-full items-center justify-center">
            <Icon icon={mdiCallMerge} size="48" class="rotate-90 dark:text-white" />
          </div>
        </div>
        <div>
          <IconButton
            shape="round"
            color="secondary"
            variant="ghost"
            aria-label={$t('swap_merge_direction')}
            icon={mdiSwapHorizontal}
            onclick={() => ([petToMerge, petToBeMergedInto] = [petToBeMergedInto, petToMerge])}
          />
        </div>
      </div>

      <button
        type="button"
        disabled={potentialMergePets.length === 0}
        class="flex size-28 items-center rounded-full border-2 border-immich-primary px-1 md:size-32 md:px-2 dark:border-immich-dark-primary"
        onclick={() => {
          if (potentialMergePets.length > 0) {
            choosePetToMerge = !choosePetToMerge;
          }
        }}
      >
        <ImageThumbnail
          border={potentialMergePets.length > 0}
          circle
          shadow
          url={getPetsThumbnailUrl(petToBeMergedInto)}
          altText={petToBeMergedInto.name}
          widthStyle="100%"
        />
      </button>
    {:else}
      <div class="grid w-full grid-cols-1 gap-2">
        <div class="px-2">
          <button type="button" onclick={() => (choosePetToMerge = false)}> <Icon icon={mdiArrowLeft} /></button>
        </div>
        <div class="flex items-center justify-center">
          <div class="flex flex-wrap justify-center md:grid md:grid-cols-{potentialMergePets.length}">
            {#each potentialMergePets as pet (pet.id)}
              <div class="size-24 md:size-28">
                <button type="button" class="w-full p-2" onclick={() => changePetToMerge(pet)}>
                  <ImageThumbnail
                    border={true}
                    circle
                    shadow
                    url={getPetsThumbnailUrl(pet)}
                    altText={pet.name}
                    widthStyle="100%"
                  />
                </button>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="flex px-4 md:pt-4">
    <h1 class="text-xl text-gray-500 dark:text-gray-300">{$t('are_these_the_same_person')}</h1>
  </div>
  <div class="flex px-4 pt-2">
    <p class="text-sm text-gray-500 dark:text-gray-300">{$t('they_will_be_merged_together')}</p>
  </div>
</FormModal>

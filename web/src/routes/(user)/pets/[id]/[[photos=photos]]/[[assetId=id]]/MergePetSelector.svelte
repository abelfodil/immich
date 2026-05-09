<script lang="ts">
  import { goto } from '$app/navigation';
  import ControlAppBar from '$lib/components/shared-components/ControlAppBar.svelte';
  import ImageThumbnail from '$lib/components/assets/thumbnail/ImageThumbnail.svelte';
  import { Route } from '$lib/route';
  import { getPetsThumbnailUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { getAllPets, getPet, mergePet, type PetResponseDto } from '@immich/sdk';
  import { Button, Icon, IconButton, modalManager, toastManager } from '@immich/ui';
  import { mdiCallMerge, mdiMerge, mdiSwapHorizontal } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { flip } from 'svelte/animate';
  import { quintOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';

  interface Props {
    pet: PetResponseDto;
    onBack: () => void;
    onMerge: (mergedPet: PetResponseDto) => void;
  }

  const { pet: initialPet, onBack, onMerge }: Props = $props();

  // local copy so swap works without needing a bindable parent
  let targetPet = $state(initialPet);
  let pets: PetResponseDto[] = $state([]);
  let selectedPets: PetResponseDto[] = $state([]);
  let screenHeight: number = $state(0);

  let hasSelection = $derived(selectedPets.length > 0);
  let petsToNotShow = $derived([...selectedPets, targetPet]);

  onMount(async () => {
    const data = await getAllPets({ withHidden: false });
    pets = data.pets.filter((p) => p.id !== targetPet.id);
  });

  const handleSwapPets = async () => {
    const swapped = selectedPets[0];
    [targetPet, selectedPets[0]] = [swapped, targetPet];
    await goto(Route.viewPet(targetPet));
  };

  const onSelect = async (selected: PetResponseDto) => {
    if (selectedPets.some((p) => p.id === selected.id)) {
      selectedPets = selectedPets.filter((p) => p.id !== selected.id);
      return;
    }
    if (selectedPets.length >= 5) {
      toastManager.warning($t('merge_pets_limit'));
      return;
    }
    selectedPets = [selected, ...selectedPets];
    if (selectedPets.length === 1 && !targetPet.name && selected.name) {
      await handleSwapPets();
    }
  };

  const handleMerge = async () => {
    const isConfirm = await modalManager.showDialog({ prompt: $t('merge_pets_prompt') });
    if (!isConfirm) {
      return;
    }
    try {
      const results = await mergePet({ id: targetPet.id, mergePetDto: { ids: selectedPets.map(({ id }) => id) } });
      const mergedPet = await getPet({ id: targetPet.id });
      const count = results.filter(({ success }) => success).length;
      toastManager.primary($t('merged_pets_count', { values: { count } }));
      onMerge(mergedPet);
    } catch (error) {
      handleError(error, $t('cannot_merge_pets'));
    }
  };
</script>

<svelte:window bind:innerHeight={screenHeight} />

<section
  transition:fly={{ y: 500, duration: 100, easing: quintOut }}
  class="absolute inset-s-0 top-0 size-full bg-light"
>
  <ControlAppBar onClose={onBack}>
    {#snippet leading()}
      {#if hasSelection}
        {$t('selected_count', { values: { count: selectedPets.length } })}
      {:else}
        {$t('merge_pets')}
      {/if}
      <div></div>
    {/snippet}
    {#snippet trailing()}
      <Button leadingIcon={mdiMerge} size="small" shape="round" disabled={!hasSelection} onclick={handleMerge}>
        {$t('merge')}
      </Button>
    {/snippet}
  </ControlAppBar>

  <section class="px-17.5 pt-25">
    <div class="mb-10 h-50 place-content-center place-items-center">
      <p class="mb-4 text-center uppercase dark:text-white">{$t('choose_matching_pets_to_merge')}</p>

      <div class="grid grid-flow-col-dense place-content-center place-items-center gap-4">
        {#each selectedPets as p (p.id)}
          <div animate:flip={{ duration: 250, easing: quintOut }}>
            <button type="button" class="flex flex-col items-center gap-1" onclick={() => onSelect(p)}>
              <ImageThumbnail
                circle
                shadow
                border
                url={getPetsThumbnailUrl(p)}
                altText={p.name || p.species}
                widthStyle="7.5rem"
                heightStyle="7.5rem"
              />
              <span class="max-w-24 truncate text-xs text-primary">{p.name || p.species}</span>
            </button>
          </div>
        {/each}

        {#if hasSelection}
          <div class="relative h-full">
            <div class="flex h-full flex-col justify-between">
              <div class="flex h-full items-center justify-center">
                <Icon icon={mdiCallMerge} size="48" class="rotate-90 dark:text-white" />
              </div>
              {#if selectedPets.length === 1}
                <div class="absolute bottom-2">
                  <IconButton
                    shape="round"
                    color="secondary"
                    variant="ghost"
                    aria-label={$t('swap_merge_direction')}
                    icon={mdiSwapHorizontal}
                    size="large"
                    onclick={handleSwapPets}
                  />
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <button type="button" class="flex flex-col items-center gap-1" disabled>
          <ImageThumbnail
            circle
            shadow
            border
            url={getPetsThumbnailUrl(targetPet)}
            altText={targetPet.name || targetPet.species}
            widthStyle="11.25rem"
            heightStyle="11.25rem"
          />
          <span class="max-w-36 truncate text-sm text-primary">{targetPet.name || targetPet.species}</span>
        </button>
      </div>
    </div>

    <div
      class="mt-6 overflow-y-auto rounded-3xl bg-gray-200 p-10 immich-scrollbar dark:bg-immich-dark-gray"
      style:max-height="{screenHeight - 400}px"
    >
      <div class="grid grid-cols-3 gap-8 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {#each pets.filter((p) => !petsToNotShow.some((s) => s.id === p.id)) as p (p.id)}
          <button
            type="button"
            class="flex flex-col items-center gap-1"
            class:opacity-50={hasSelection && !selectedPets.some((s) => s.id === p.id)}
            onclick={() => onSelect(p)}
          >
            <ImageThumbnail
              circle
              shadow
              border={selectedPets.some((s) => s.id === p.id)}
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

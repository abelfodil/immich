<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { ToggleVisibility } from '$lib/constants';
  import { locale } from '$lib/stores/preferences.store';
  import { getPetsThumbnailUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { getAllPets, updatePets, type PetResponseDto } from '@immich/sdk';
  import { Button, IconButton, toastManager } from '@immich/ui';
  import { mdiClose, mdiEye, mdiEyeOff, mdiEyeSettings, mdiRestart } from '@mdi/js';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { SvelteMap } from 'svelte/reactivity';
  import ImageThumbnail from '$lib/components/assets/thumbnail/ImageThumbnail.svelte';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  const { data }: Props = $props();

  let pets = $derived(data.pets.pets);
  const totalPetsCount = $derived(data.pets.total);
  let nextPage = $state(data.pets.hasNextPage ? 2 : null);
  let toggleVisibility = $state(ToggleVisibility.SHOW_ALL);
  let showLoadingSpinner = $state(false);
  const overrides = new SvelteMap<string, boolean>();

  const getNextVisibility = (tv: ToggleVisibility) => {
    if (tv === ToggleVisibility.SHOW_ALL) return ToggleVisibility.HIDE_UNNANEMD;
    if (tv === ToggleVisibility.HIDE_UNNANEMD) return ToggleVisibility.HIDE_ALL;
    return ToggleVisibility.SHOW_ALL;
  };

  const handleToggleVisibility = () => {
    toggleVisibility = getNextVisibility(toggleVisibility);
    for (const pet of pets) {
      let isHidden = overrides.get(pet.id) ?? pet.isHidden;
      if (toggleVisibility === ToggleVisibility.HIDE_ALL) {
        isHidden = true;
      } else if (toggleVisibility === ToggleVisibility.SHOW_ALL) {
        isHidden = false;
      } else if (toggleVisibility === ToggleVisibility.HIDE_UNNANEMD && !pet.name) {
        isHidden = true;
      }
      setHiddenOverride(pet, isHidden);
    }
  };

  const handleSaveVisibility = async () => {
    showLoadingSpinner = true;
    const changed = Array.from(overrides, ([id, isHidden]) => ({ id, isHidden }));
    try {
      if (changed.length > 0) {
        const results = await updatePets({ petsUpdateDto: { pets: changed } });
        const successCount = results.filter(({ success }) => success).length;
        const failCount = results.length - successCount;
        if (failCount > 0) {
          toastManager.warning($t('errors.unable_to_change_visibility', { values: { count: failCount } }));
        }
        toastManager.primary($t('visibility_changed', { values: { count: successCount } }));
      }
      for (const pet of pets) {
        const isHidden = overrides.get(pet.id);
        if (isHidden !== undefined) {
          pet.isHidden = isHidden;
        }
      }
      overrides.clear();
      await goto('/pets');
    } catch (error_) {
      handleError(error_, $t('errors.unable_to_change_visibility', { values: { count: changed.length } }));
    } finally {
      showLoadingSpinner = false;
    }
  };

  const setHiddenOverride = (pet: PetResponseDto, isHidden: boolean) => {
    if (isHidden === pet.isHidden) {
      overrides.delete(pet.id);
      return;
    }
    overrides.set(pet.id, isHidden);
  };

  const loadNextPage = async () => {
    if (!nextPage) return;
    try {
      const { pets: newPets, hasNextPage } = await getAllPets({ withHidden: true, page: nextPage });
      pets = pets.concat(newPets);
      nextPage = hasNextPage ? nextPage + 1 : null;
    } catch (error_) {
      handleError(error_, $t('errors.failed_to_load_pets'));
    }
  };

  let toggleButtonOptions: Record<ToggleVisibility, { icon: string; label: string }> = $derived({
    [ToggleVisibility.HIDE_ALL]: { icon: mdiEyeOff, label: $t('hide_all_pets') },
    [ToggleVisibility.HIDE_UNNANEMD]: { icon: mdiEyeSettings, label: $t('hide_unnamed_pets') },
    [ToggleVisibility.SHOW_ALL]: { icon: mdiEye, label: $t('show_all_pets') },
  });
  let toggleButton = $derived(toggleButtonOptions[getNextVisibility(toggleVisibility)]);
</script>

<UserPageLayout title={$t('show_and_hide_pets')} description={`(${totalPetsCount.toLocaleString($locale)})`}>
  {#snippet buttons()}
    <div class="flex items-center justify-end">
      <div class="flex items-center md:me-4">
        <IconButton
          shape="round"
          color="secondary"
          variant="ghost"
          aria-label={$t('close')}
          icon={mdiClose}
          onclick={() => goto('/pets')}
        />
        <IconButton
          shape="round"
          color="secondary"
          variant="ghost"
          aria-label={$t('reset_pets_visibility')}
          icon={mdiRestart}
          onclick={() => overrides.clear()}
        />
        <IconButton
          shape="round"
          color="secondary"
          variant="ghost"
          aria-label={toggleButton.label}
          icon={toggleButton.icon}
          onclick={handleToggleVisibility}
        />
      </div>
      <Button loading={showLoadingSpinner} onclick={handleSaveVisibility} size="small">{$t('done')}</Button>
    </div>
  {/snippet}

  <div class="flex flex-wrap gap-1 p-2 pb-8 md:px-8">
    {#each pets as pet (pet.id)}
      {@const hidden = overrides.get(pet.id) ?? pet.isHidden}
      <button
        type="button"
        class="group relative size-24"
        onclick={() => setHiddenOverride(pet, !hidden)}
        aria-pressed={hidden}
        aria-label={pet.name ? $t('hide_named_pet', { values: { name: pet.name } }) : $t('hide_pet')}
      >
        <ImageThumbnail
          {hidden}
          shadow
          url={getPetsThumbnailUrl(pet)}
          altText={pet.name || pet.species}
          widthStyle="100%"
          circle
          hiddenIconClass="text-white group-hover:text-black transition-colors"
          preload={false}
        />
        {#if pet.name}
          <span class="absolute inset-s-0 bottom-2 w-full px-1 text-center text-xs font-medium text-white select-text">
            {pet.name}
          </span>
        {/if}
      </button>
    {/each}

    {#if nextPage}
      <div class="w-full flex justify-center py-4">
        <button
          type="button"
          class="rounded-full bg-immich-primary px-4 py-2 text-sm text-white"
          onclick={loadNextPage}
        >
          {$t('load_more')}
        </button>
      </div>
    {/if}
  </div>
</UserPageLayout>

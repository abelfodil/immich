<script lang="ts">
  import { afterNavigate, goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { clickOutside } from '$lib/actions/click-outside';
  import { scrollMemoryClearer } from '$lib/actions/scroll-memory';
  import ImageThumbnail from '$lib/components/assets/thumbnail/ImageThumbnail.svelte';
  import EditNameInput from './EditNameInput.svelte';
  import MergePetSelector from './MergePetSelector.svelte';
  import ReassignPetDetectionSelector from './ReassignPetDetectionSelector.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import ControlAppBar from '$lib/components/shared-components/ControlAppBar.svelte';
  import ArchiveAction from '$lib/components/timeline/actions/ArchiveAction.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import CreateSharedLink from '$lib/components/timeline/actions/CreateSharedLinkAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '$lib/components/timeline/actions/FavoriteAction.svelte';
  import SelectAllAssets from '$lib/components/timeline/actions/SelectAllAction.svelte';
  import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';
  import TagAction from '$lib/components/timeline/actions/TagAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { PetPageViewMode, QueryParameter, SessionStorageKey } from '$lib/constants';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import { Route } from '$lib/route';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import { getPetActions } from '$lib/services/pet.service';
  import { getPetsThumbnailUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { isExternalUrl } from '$lib/utils/navigation';
  import { AssetVisibility, updatePet, type PetResponseDto } from '@immich/sdk';
  import {
    ActionButton,
    CommandPaletteDefaultProvider,
    ContextMenuButton,
    toastManager,
    type ActionItem,
  } from '@immich/ui';
  import { mdiAccountBoxOutline, mdiAccountMultipleCheckOutline, mdiArrowLeft, mdiDotsVertical, mdiMerge } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let numberOfAssets = $derived(data.statistics.assets);
  let pet = $derived(data.pet);

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  const options = $derived({ visibility: AssetVisibility.Timeline, petId: data.pet.id });

  let viewMode: PetPageViewMode = $state(PetPageViewMode.VIEW_ASSETS);
  let isEditingName = $state(false);
  let previousRoute = $state<string>(Route.pets());
  let thumbnailUrl = $state(getPetsThumbnailUrl(pet));

  onMount(() => {
    const action = $page.url.searchParams.get(QueryParameter.ACTION);
    const getPreviousRoute = $page.url.searchParams.get(QueryParameter.PREVIOUS_ROUTE);
    if (getPreviousRoute && !isExternalUrl(getPreviousRoute)) {
      previousRoute = getPreviousRoute;
    }
    if (action === 'merge') {
      viewMode = PetPageViewMode.MERGE_PETS;
    }
  });

  afterNavigate(({ from }) => {
    if (from?.url && from.route.id !== $page.route.id) {
      previousRoute = from.url.href;
    }
  });

  const handleEscape = async () => {
    if (assetMultiSelectManager.selectionActive) {
      assetMultiSelectManager.clear();
      return;
    }
    await goto(previousRoute);
  };

  const updateAssetCount = async () => {
    await invalidateAll();
  };

  const handleSelectFeaturePhoto = async (asset: TimelineAsset) => {
    if (viewMode !== PetPageViewMode.SELECT_PET) {
      return;
    }
    try {
      await updatePet({ id: pet.id, petUpdateDto: { thumbnailAssetId: asset.id } });
      thumbnailUrl = getPetsThumbnailUrl(pet, Date.now().toString());
      toastManager.primary($t('feature_photo_updated'));
    } catch (error_) {
      handleError(error_, $t('errors.unable_to_set_feature_photo'));
    }
    assetMultiSelectManager.clear();
    viewMode = PetPageViewMode.VIEW_ASSETS;
  };

  const handleNameChange = async (name: string) => {
    isEditingName = false;
    if (pet.name === name) {
      return;
    }
    try {
      await updatePet({ id: pet.id, petUpdateDto: { name } });
      toastManager.primary($t('change_name_successfully'));
    } catch (error_) {
      handleError(error_, $t('errors.unable_to_save_name'));
    }
  };

  const handleReassignAssets = () => {
    viewMode = PetPageViewMode.UNASSIGN_DETECTIONS;
  };

  const handleUnassign = () => {
    timelineManager.removeAssets(assetMultiSelectManager.assets.map((a) => a.id));
    assetMultiSelectManager.clear();
    viewMode = PetPageViewMode.VIEW_ASSETS;
  };

  const handleDeleteAssets = async (assetIds: string[]) => {
    timelineManager.removeAssets(assetIds);
    await updateAssetCount();
  };

  const handleUndoDeleteAssets = async (assets: TimelineAsset[]) => {
    timelineManager.upsertAssets(assets);
    await updateAssetCount();
  };

  const handleSetVisibility = (assetIds: string[]) => {
    timelineManager.removeAssets(assetIds);
    assetMultiSelectManager.clear();
  };

  const onPetUpdate = async (response: PetResponseDto) => {
    if (response.id !== pet.id) {
      return;
    }
    if (response.isHidden) {
      await goto(previousRoute);
      return;
    }
    data = { ...data, pet: response };
  };

  const { HidePet, ShowPet, Favorite, Unfavorite } = $derived(getPetActions($t, pet));

  const SelectFeaturePhoto: ActionItem = {
    title: $t('select_featured_photo'),
    icon: mdiAccountBoxOutline,
    onAction: () => {
      viewMode = PetPageViewMode.SELECT_PET;
    },
  };

  const MergePets: ActionItem = {
    title: $t('merge_pets'),
    icon: mdiMerge,
    onAction: () => {
      viewMode = PetPageViewMode.MERGE_PETS;
    },
  };

  const handleMerge = (mergedPet: PetResponseDto) => {
    data = { ...data, pet: mergedPet };
    viewMode = PetPageViewMode.VIEW_ASSETS;
  };
</script>

<OnEvents {onPetUpdate} onAssetsDelete={updateAssetCount} onAssetsArchive={updateAssetCount} />

<main
  class="relative z-0 h-dvh overflow-hidden px-2 pt-(--navbar-height) md:px-6 md:pt-(--navbar-height-md)"
  use:scrollMemoryClearer={{
    routeStartsWith: Route.pets(),
    beforeClear: () => {
      sessionStorage.removeItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
    },
  }}
>
  {#key pet.id}
    <Timeline
      enableRouting={true}
      bind:timelineManager
      {options}
      assetInteraction={assetMultiSelectManager}
      isSelectionMode={viewMode === PetPageViewMode.SELECT_PET}
      singleSelect={viewMode === PetPageViewMode.SELECT_PET}
      onSelect={handleSelectFeaturePhoto}
      onEscape={handleEscape}
    >
      {#if viewMode === PetPageViewMode.VIEW_ASSETS}
        <div
          class="relative w-fit p-4 pt-12 sm:px-6"
          use:clickOutside={{
            onOutclick: () => (isEditingName = false),
            onEscape: () => (isEditingName = false),
          }}
        >
          <section class="flex w-64 place-items-center border-black sm:w-96">
            {#if isEditingName}
              <EditNameInput
                {thumbnailUrl}
                altText={pet.name || pet.species || $t('unnamed_pet')}
                name={pet.name || ''}
                onChange={handleNameChange}
              />
            {:else}
              <button
                type="button"
                class="flex items-center justify-center"
                title={$t('edit_name')}
                onclick={() => (isEditingName = true)}
              >
                <ImageThumbnail
                  circle
                  shadow
                  url={thumbnailUrl}
                  altText={pet.name || pet.species || $t('unnamed_pet')}
                  widthStyle="3.375rem"
                  heightStyle="3.375rem"
                />
                <div class="flex flex-col justify-center px-4 text-start text-primary">
                  <p class="w-40 truncate font-medium sm:w-72">{pet.name || $t('add_a_name')}</p>
                  {#if pet.species}
                    <p class="text-sm capitalize text-gray-500 dark:text-gray-400">{pet.species}</p>
                  {/if}
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {$t('assets_count', { values: { count: numberOfAssets } })}
                  </p>
                </div>
              </button>
            {/if}
          </section>
        </div>
      {/if}
    </Timeline>
  {/key}
</main>

<header>
  {#if assetMultiSelectManager.selectionActive}
    <AssetSelectControlBar>
      {@const Actions = getAssetBulkActions($t)}
      <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />
      <CreateSharedLink />
      <SelectAllAssets {timelineManager} assetInteraction={assetMultiSelectManager} />
      <ActionButton action={Actions.AddToAlbum} />
      <FavoriteAction
        removeFavorite={assetMultiSelectManager.isAllFavorite}
        onFavorite={(ids, isFavorite) => timelineManager.update(ids, (asset) => (asset.isFavorite = isFavorite))}
      />
      <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')}>
        <DownloadAction menuItem filename="{pet.name || 'immich'}.zip" />
        <MenuOption
          icon={mdiAccountMultipleCheckOutline}
          text={$t('fix_incorrect_match')}
          onClick={handleReassignAssets}
        />
        <ChangeDate menuItem />
        <ChangeDescription menuItem />
        <ChangeLocation menuItem />
        <ArchiveAction
          menuItem
          unarchive={assetMultiSelectManager.isAllArchived}
          onArchive={(ids, visibility) => timelineManager.update(ids, (asset) => (asset.visibility = visibility))}
        />
        {#if authManager.preferences.tags.enabled && assetMultiSelectManager.isAllUserOwned}
          <TagAction menuItem />
        {/if}
        <SetVisibilityAction menuItem onVisibilitySet={handleSetVisibility} />
        <DeleteAssets
          menuItem
          onAssetDelete={(assetIds) => handleDeleteAssets(assetIds)}
          onUndoDelete={(assets) => handleUndoDeleteAssets(assets)}
        />
      </ButtonContextMenu>
    </AssetSelectControlBar>
  {:else if viewMode === PetPageViewMode.VIEW_ASSETS}
    <ControlAppBar showBackButton backIcon={mdiArrowLeft} onClose={() => goto(previousRoute)}>
      {#snippet trailing()}
        <ContextMenuButton
          items={[SelectFeaturePhoto, MergePets, HidePet, ShowPet, Favorite, Unfavorite]}
          aria-label={$t('open')}
        />
      {/snippet}
    </ControlAppBar>
  {:else if viewMode === PetPageViewMode.SELECT_PET}
    <ControlAppBar onClose={() => (viewMode = PetPageViewMode.VIEW_ASSETS)}>
      {#snippet leading()}
        {$t('select_featured_photo')}
      {/snippet}
    </ControlAppBar>
  {/if}
</header>

{#if viewMode === PetPageViewMode.UNASSIGN_DETECTIONS}
  <ReassignPetDetectionSelector
    assetIds={assetMultiSelectManager.assets.map((a) => a.id)}
    {pet}
    onClose={() => (viewMode = PetPageViewMode.VIEW_ASSETS)}
    onConfirm={handleUnassign}
  />
{/if}

{#if viewMode === PetPageViewMode.MERGE_PETS}
  <MergePetSelector
    {pet}
    onBack={() => (viewMode = PetPageViewMode.VIEW_ASSETS)}
    onMerge={handleMerge}
  />
{/if}

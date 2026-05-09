<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { scrollMemory } from '$lib/actions/scroll-memory';
  import { shortcut } from '$lib/actions/shortcut';
  import PetSearch from '$lib/components/faces-page/PetSearch.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { QueryParameter, SessionStorageKey } from '$lib/constants';
  import PetMergeSuggestionModal from '$lib/modals/PetMergeSuggestionModal.svelte';
  import { Route } from '$lib/route';
  import { locale } from '$lib/stores/preferences.store';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { handlePromiseError } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { clearQueryParam } from '$lib/utils/navigation';
  import { getAllPets, getPet, searchPets, updatePet, type PetResponseDto } from '@immich/sdk';
  import { Button, Icon, modalManager } from '@immich/ui';
  import { mdiEyeOutline, mdiPawOff } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';
  import PetCard from './PetCard.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let currentPage = $state(1);
  let nextPage = $state(data.pets.hasNextPage ? 2 : null);
  let newName = $state('');
  let editingPet: PetResponseDto | null = $state(null);
  let searchName = $state('');
  let searchedPetsLocal: PetResponseDto[] = $state([]);
  let petMerge1 = $state<PetResponseDto>();
  let petMerge2 = $state<PetResponseDto>();
  let potentialMergePets: PetResponseDto[] = $state([]);
  let petSearchElement = $state<ReturnType<typeof PetSearch>>();

  onMount(() => {
    const searchedPets = $page.url.searchParams.get(QueryParameter.SEARCHED_PETS);
    if (searchedPets) {
      searchName = searchedPets;
      if (petSearchElement) {
        handlePromiseError(petSearchElement.searchPetsServer(true, searchName));
      }
    }

    return eventManager.on({
      PetThumbnailReady: ({ id }) => {
        for (const pet of pets) {
          if (pet.id === id) {
            pet.updatedAt = new Date().toISOString();
          }
        }
      },
    });
  });

  const loadInitialScroll = () =>
    new Promise<void>((resolve) => {
      const newNextPage = sessionStorage.getItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
      if (newNextPage && nextPage) {
        const startingPage = nextPage;
        const pagesToLoad = Number.parseInt(newNextPage) - nextPage;
        if (pagesToLoad) {
          handlePromiseError(
            Promise.all(
              Array.from({ length: pagesToLoad }).map((_, i) => {
                return getAllPets({ withHidden: true, page: startingPage + i });
              }),
            ).then((pages) => {
              for (const page of pages) {
                pets = pets.concat(page.pets);
              }
              currentPage = startingPage + pagesToLoad - 1;
              nextPage = pages.at(-1)?.hasNextPage ? startingPage + pagesToLoad : null;
              resolve();
            }),
          );
        } else {
          resolve();
        }
        sessionStorage.removeItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
      }
    });

  const loadNextPage = async () => {
    if (!nextPage) {
      return;
    }
    try {
      const { pets: newPets, hasNextPage } = await getAllPets({ withHidden: true, page: nextPage });
      pets = pets.concat(newPets);
      if (nextPage !== null) {
        currentPage = nextPage;
      }
      nextPage = hasNextPage ? nextPage + 1 : null;
    } catch (error) {
      handleError(error, $t('errors.failed_to_load_pets'));
    }
  };

  const handleSearch = async () => {
    const current = $page.url.searchParams.get(QueryParameter.SEARCHED_PETS);
    if (current !== searchName) {
      $page.url.searchParams.set(QueryParameter.SEARCHED_PETS, searchName);
      await goto($page.url, { keepFocus: true });
    }
  };

  const handleHidePet = async (pet: PetResponseDto) => {
    try {
      const updated = await updatePet({ id: pet.id, petUpdateDto: { isHidden: true } });
      pets = pets.map((p) => (p.id === updated.id ? updated : p));
    } catch (error) {
      handleError(error, $t('errors.unable_to_hide_pet'));
    }
  };

  const handleToggleFavorite = async (pet: PetResponseDto) => {
    try {
      const updated = await updatePet({ id: pet.id, petUpdateDto: { isFavorite: !pet.isFavorite } });
      pets = pets.map((p) => (p.id === updated.id ? updated : p));
    } catch (error) {
      handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: pet.isFavorite } }));
    }
  };

  const onResetSearchBar = async () => {
    await clearQueryParam(QueryParameter.SEARCHED_PETS, $page.url);
  };

  const onNameChangeInputFocus = (pet: PetResponseDto) => {
    editingPet = pet;
    newName = pet.name;
  };

  const updateName = async (id: string, name: string) => {
    await updatePet({ id, petUpdateDto: { name } });
    newName = '';
  };

  const findPetWithSimilarName = async (name: string, petId: string) => {
    const results = await searchPets({ name, withHidden: true });
    return results.find((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== petId && p.name);
  };

  const handleMerge = async () => {
    if (!editingPet || !petMerge1 || !petMerge2) {
      return;
    }

    const response = await modalManager.show(PetMergeSuggestionModal, {
      petToMerge: petMerge1,
      petToBeMergedInto: petMerge2,
      potentialMergePets,
    });

    if (!response) {
      await updateName(petMerge1.id, newName);
      return;
    }

    const [petToMerge, petToBeMergedInto] = response;
    const mergedPet = await getPet({ id: petToBeMergedInto.id });

    pets = pets.filter((p) => p.id !== petToMerge.id);
    pets = pets.map((p) => (p.id === petToBeMergedInto.id ? mergedPet : p));
  };

  const onNameChangeSubmit = async (name: string, targetPet: PetResponseDto) => {
    try {
      if (name === targetPet.name) {
        return;
      }
      if (name === '') {
        await updateName(targetPet.id, '');
        return;
      }
      const petWithSimilarName = await findPetWithSimilarName(name, targetPet.id);
      if (petWithSimilarName) {
        petMerge1 = targetPet;
        petMerge2 = petWithSimilarName;
        potentialMergePets = pets
          .filter(
            (p) =>
              petMerge2?.name.toLowerCase() === p.name.toLowerCase() &&
              p.id !== petMerge2?.id &&
              p.id !== petMerge1?.id &&
              !p.isHidden,
          )
          .slice(0, 3);
        await handleMerge();
        return;
      }
      await updateName(targetPet.id, name);
      pets = pets.map((p) => (p.id === targetPet.id ? { ...p, name } : p));
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_name'));
    }
  };

  const onNameChangeInputUpdate = (event: Event) => {
    if (event.target) {
      newName = (event.target as HTMLInputElement).value;
    }
  };

  let pets = $derived(data.pets.pets);
  let visiblePets = $derived(pets.filter((p) => !p.isHidden));
  let showPets = $derived(searchName ? searchedPetsLocal : visiblePets);
  let countVisiblePets = $derived(searchName ? searchedPetsLocal.length : data.pets.total - data.pets.hidden);
</script>

<UserPageLayout
  title={$t('pets')}
  description={countVisiblePets === 0 && !searchName ? undefined : `(${countVisiblePets.toLocaleString($locale)})`}
  use={[
    [
      scrollMemory,
      {
        routeStartsWith: Route.pets(),
        beforeSave: () => {
          if (currentPage) {
            sessionStorage.setItem(SessionStorageKey.INFINITE_SCROLL_PAGE, currentPage.toString());
          }
        },
        beforeClear: () => {
          sessionStorage.removeItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
        },
        beforeLoad: loadInitialScroll,
      },
    ],
  ]}
>
  {#snippet buttons()}
    {#if pets.length > 0}
      <div class="flex items-center justify-center gap-2">
        <div class="hidden sm:block">
          <div class="h-10 w-40 lg:w-80">
            <PetSearch
              bind:this={petSearchElement}
              type="searchBar"
              placeholder={$t('search_pets')}
              onReset={onResetSearchBar}
              onSearch={handleSearch}
              bind:searchName
              bind:searchedPetsLocal
            />
          </div>
        </div>
        <Button
          leadingIcon={mdiEyeOutline}
          onclick={() => goto('/pets/manage')}
          size="small"
          variant="ghost"
          color="secondary">{$t('show_and_hide_pets')}</Button
        >
      </div>
    {/if}
  {/snippet}

  {#if countVisiblePets > 0 && (!searchName || searchedPetsLocal.length > 0)}
    <div class="grid w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-10">
      {#each showPets as pet (pet.id)}
        <div
          class="rounded-xl border-2 border-transparent p-2 transition-all hover:border-immich-primary/50 hover:bg-gray-200 hover:shadow-sm hover:dark:border-immich-dark-primary/25 dark:hover:bg-immich-dark-primary/20"
        >
          <PetCard
            {pet}
            onMergePet={() =>
              goto(
                Route.viewPet(pet, { previousRoute: Route.pets() }) +
                  `&${QueryParameter.ACTION}=merge`,
              )}
            onHidePet={() => handleHidePet(pet)}
            onToggleFavorite={() => handleToggleFavorite(pet)}
          />

          <input
            type="text"
            class="mt-2 w-full rounded-2xl border-gray-100 bg-white py-2 text-center text-sm text-primary placeholder-gray-400 dark:border-gray-900 dark:bg-immich-dark-gray"
            value={pet.name}
            placeholder={$t('add_a_name')}
            use:shortcut={{ shortcut: { key: 'Enter' }, onShortcut: (e) => e.currentTarget.blur() }}
            onfocusin={() => onNameChangeInputFocus(pet)}
            onfocusout={() => onNameChangeSubmit(newName, pet)}
            oninput={(event) => onNameChangeInputUpdate(event)}
          />
        </div>
      {/each}

      {#if nextPage && !searchName}
        <div class="col-span-full flex justify-center py-4">
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
  {:else}
    <div class="flex min-h-[calc(66vh-11rem)] w-full place-content-center items-center dark:text-white">
      <div class="flex flex-col content-center items-center text-center">
        <Icon icon={mdiPawOff} size="3.5em" />
        <p class="mt-5 line-clamp-2 max-w-lg overflow-hidden text-3xl font-medium">
          {$t(searchName ? 'search_no_pets_named' : 'search_no_pets', { values: { name: searchName } })}
        </p>
      </div>
    </div>
  {/if}
</UserPageLayout>

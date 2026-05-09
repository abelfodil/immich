<script lang="ts">
  import { initInput } from '$lib/actions/focus';
  import { maximumLengthSearchPeople, timeBeforeShowLoadingSpinner } from '$lib/constants';
  import SearchBar from '$lib/elements/SearchBar.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { searchPets, type PetResponseDto } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  let searchedPets: PetResponseDto[] = [];
  let searchWord: string;
  let abortController: AbortController | null = null;
  let timeout: NodeJS.Timeout | null = null;

  const searchLocal = (name: string, pets: PetResponseDto[], slice: number): PetResponseDto[] => {
    const lower = name.toLowerCase();
    return pets
      .filter((p) => {
        const haystack = `${p.name} ${p.species ?? ''}`.toLowerCase();
        return haystack.includes(lower);
      })
      .slice(0, slice);
  };

  const search = () => {
    searchedPetsLocal = searchLocal(searchName, searchedPets, numberPetsToSearch);
  };

  const reset = () => {
    searchedPetsLocal = [];
    cancelPreviousRequest();
    onReset();
  };

  const cancelPreviousRequest = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  interface Props {
    searchName: string;
    searchedPetsLocal: PetResponseDto[];
    type: 'searchBar' | 'input';
    numberPetsToSearch?: number;
    inputClass?: string;
    showLoadingSpinner?: boolean;
    placeholder?: string;
    onReset?: () => void;
    onSearch?: () => void;
  }

  let {
    searchName = $bindable(),
    // eslint-disable-next-line no-useless-assignment
    searchedPetsLocal = $bindable(),
    type,
    numberPetsToSearch = maximumLengthSearchPeople,
    inputClass = 'w-full gap-2',
    showLoadingSpinner = $bindable(false),
    placeholder = $t('name_or_nickname'),
    onReset = () => {},
    onSearch = () => {},
  }: Props = $props();

  const handleReset = () => {
    reset();
    onReset();
  };

  export async function searchPetsServer(force?: boolean, name?: string) {
    searchName = name ?? searchName;
    onSearch();
    if (searchName === '') {
      reset();
      return;
    }
    if (
      !force &&
      searchedPets.length > 0 &&
      searchedPets.length < maximumLengthSearchPeople &&
      searchName.startsWith(searchWord)
    ) {
      search();
      return;
    }
    cancelPreviousRequest();
    abortController = new AbortController();
    timeout = setTimeout(() => (showLoadingSpinner = true), timeBeforeShowLoadingSpinner);
    try {
      const data = await searchPets({ name: searchName }, { signal: abortController?.signal });
      searchedPets = data;
      searchWord = searchName;
    } catch (error) {
      handleError(error, $t('errors.cant_search_pets'));
    } finally {
      clearTimeout(timeout);
      timeout = null;
      abortController = null;
      showLoadingSpinner = false;
      search();
    }
  }
</script>

{#if type === 'searchBar'}
  <SearchBar
    bind:name={searchName}
    {showLoadingSpinner}
    {placeholder}
    onReset={handleReset}
    onSearch={({ force }) => searchPetsServer(force ?? false)}
  />
{:else}
  <input
    class={inputClass}
    type="text"
    {placeholder}
    bind:value={searchName}
    oninput={() => searchPetsServer(false)}
    use:initInput
  />
{/if}

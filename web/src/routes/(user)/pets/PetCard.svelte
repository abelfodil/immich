<script lang="ts">
  import { focusOutside } from '$lib/actions/focus-outside';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import { Route } from '$lib/route';
  import { getPetsThumbnailUrl } from '$lib/utils';
  import { type PetResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import {
    mdiDotsVertical,
    mdiEyeOffOutline,
    mdiHeart,
    mdiHeartMinusOutline,
    mdiHeartOutline,
    mdiMerge,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import ImageThumbnail from '$lib/components/assets/thumbnail/ImageThumbnail.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';

  type Props = {
    pet: PetResponseDto;
    onMergePet: () => void;
    onHidePet: () => void;
    onToggleFavorite: () => void;
  };

  let { pet, onMergePet, onHidePet, onToggleFavorite }: Props = $props();

  let showVerticalDots = $state(false);
</script>

<div
  id="pet-card"
  class="relative"
  onmouseenter={() => (showVerticalDots = true)}
  onmouseleave={() => (showVerticalDots = false)}
  role="group"
  use:focusOutside={{ onFocusOut: () => (showVerticalDots = false) }}
>
  <a
    href={Route.viewPet(pet, { previousRoute: Route.pets() })}
    draggable="false"
    onfocus={() => (showVerticalDots = true)}
  >
    <div class="size-full rounded-xl brightness-95 filter">
      <ImageThumbnail
        shadow
        url={getPetsThumbnailUrl(pet)}
        altText={pet.name || pet.species}
        title={pet.name || pet.species}
        widthStyle="100%"
        circle
        preload={false}
      />
      {#if pet.isFavorite}
        <div class="absolute inset-s-4 top-4">
          <Icon icon={mdiHeart} size="24" class="text-white" />
        </div>
      {/if}
    </div>
    {#if pet.species}
      <div class="absolute bottom-2 start-1/2 -translate-x-1/2">
        <span
          class="rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium capitalize text-white"
        >
          {pet.species}
        </span>
      </div>
    {/if}
  </a>

  {#if showVerticalDots}
    <div class="absolute inset-e-2 top-2 z-1">
      <ButtonContextMenu
        buttonClass="icon-white-drop-shadow"
        color="secondary"
        size="medium"
        variant="filled"
        icon={mdiDotsVertical}
        title={$t('show_pet_options')}
      >
        <MenuOption onClick={onHidePet} icon={mdiEyeOffOutline} text={$t('hide_pet')} />
        <MenuOption onClick={onMergePet} icon={mdiMerge} text={$t('merge_pets')} />
        <MenuOption
          onClick={onToggleFavorite}
          icon={pet.isFavorite ? mdiHeartMinusOutline : mdiHeartOutline}
          text={pet.isFavorite ? $t('unfavorite') : $t('to_favorite')}
        />
      </ButtonContextMenu>
    </div>
  {/if}
</div>

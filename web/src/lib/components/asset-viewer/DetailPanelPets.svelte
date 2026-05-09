<script lang="ts">
  import ImageThumbnail from '$lib/components/assets/thumbnail/ImageThumbnail.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { Route } from '$lib/route';
  import { getPetsThumbnailUrl } from '$lib/utils';
  import { type AssetResponseDto } from '@immich/sdk';
  import { IconButton, Text } from '@immich/ui';
  import { mdiEye, mdiEyeOff, mdiPencil, mdiPlus } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    asset: AssetResponseDto;
    isOwner: boolean;
    previousRoute: string;
    onOpenPetPanel: () => void;
  };

  const { asset, isOwner, previousRoute, onOpenPetPanel }: Props = $props();

  const pets = $derived(asset.pets || []);
  const visiblePets = $derived(
    pets.filter((p) => assetViewerManager.isShowingHiddenPets || !p.isHidden),
  );
</script>

{#if !authManager.isSharedLink && isOwner}
  <section class="px-4 pt-4 text-sm">
    <div class="flex h-10 w-full items-center justify-between">
      <Text size="small" color="muted">{$t('pets')}</Text>
      <div class="flex items-center gap-2">
        {#if pets.some((p) => p.isHidden)}
          <IconButton
            aria-label={$t('show_hidden_pets')}
            icon={assetViewerManager.isShowingHiddenPets ? mdiEyeOff : mdiEye}
            size="medium"
            shape="round"
            color="secondary"
            variant="ghost"
            onclick={() => assetViewerManager.toggleHiddenPets()}
          />
        {/if}
        <IconButton
          aria-label={$t('tag_pets')}
          icon={mdiPlus}
          size="medium"
          shape="round"
          color="secondary"
          variant="ghost"
          onclick={onOpenPetPanel}
        />
        {#if pets.length > 0}
          <IconButton
            aria-label={$t('edit_pets')}
            icon={mdiPencil}
            size="medium"
            shape="round"
            color="secondary"
            variant="ghost"
            onclick={onOpenPetPanel}
          />
        {/if}
      </div>
    </div>

    {#if visiblePets.length > 0}
      <div class="mt-2 grid {visiblePets.length <= 6 ? 'grid-cols-3 gap-3' : 'grid-cols-4 gap-2'}">
        {#each visiblePets as pet (pet.id)}
          {@const isHighlighted = pet.detections.some((d) =>
            assetViewerManager.highlightedFaces.some((f) => f.id === d.id),
          )}
          <a
            class="group outline-none"
            href={Route.viewPet(pet, { previousRoute })}
            onfocus={() => assetViewerManager.setHighlightedFaces(pet.detections)}
            onblur={() => assetViewerManager.clearHighlightedFaces()}
            onpointerenter={() => assetViewerManager.setHighlightedFaces(pet.detections)}
            onpointerleave={() => assetViewerManager.clearHighlightedFaces()}
          >
            <ImageThumbnail
              curve
              shadow
              url={getPetsThumbnailUrl(pet)}
              altText={pet.name}
              title={pet.name}
              widthStyle="100%"
              hidden={pet.isHidden}
              highlighted={isHighlighted}
              class="outline-offset-2 outline-immich-primary group-focus-visible:outline-2 dark:outline-immich-dark-primary"
            />
            <p class="mt-1 truncate font-medium" title={pet.name}>{pet.name}</p>
          </a>
        {/each}
      </div>
    {/if}
  </section>
{/if}

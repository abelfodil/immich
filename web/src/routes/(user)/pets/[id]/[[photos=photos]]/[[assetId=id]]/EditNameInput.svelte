<script lang="ts">
  import ImageThumbnail from '$lib/components/assets/thumbnail/ImageThumbnail.svelte';
  import { Button } from '@immich/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    thumbnailUrl: string;
    altText: string;
    name: string;
    onChange: (name: string) => void;
  }

  let { thumbnailUrl, altText, name = $bindable(), onChange }: Props = $props();

  const onsubmit = (event: Event) => {
    event.preventDefault();
    onChange(name);
  };
</script>

<div
  class="flex h-14 w-full place-items-center rounded-lg border border-gray-200 bg-gray-100 p-2 dark:border-immich-dark-gray dark:bg-gray-700"
>
  <ImageThumbnail circle shadow url={thumbnailUrl} {altText} widthStyle="2rem" heightStyle="2rem" />
  <form class="ms-4 flex w-full justify-between gap-16" autocomplete="off" {onsubmit}>
    <input
      class="w-full bg-gray-100 text-immich-dark-bg outline-none dark:bg-gray-700 dark:text-white"
      type="text"
      bind:value={name}
      placeholder={$t('add_a_name')}
    />
    <Button size="small" shape="round" type="submit">{$t('done')}</Button>
  </form>
</div>

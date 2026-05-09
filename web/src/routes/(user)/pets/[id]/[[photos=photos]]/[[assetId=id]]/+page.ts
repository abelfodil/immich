import { getPet, getPetStatistics } from '@immich/sdk';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load = (async ({ params, url }) => {
  await authenticate(url);
  const [pet, statistics] = await Promise.all([
    getPet({ id: params.id }).catch(() => null),
    getPetStatistics({ id: params.id }).catch(() => ({ assets: 0 })),
  ]);
  if (!pet) error(404, 'Pet not found');
  const $t = await getFormatter();
  return { pet, statistics, meta: { title: pet.name || $t('unnamed_pet') } };
}) satisfies PageLoad;

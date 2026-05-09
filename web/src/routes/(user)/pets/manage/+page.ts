import { getAllPets } from '@immich/sdk';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);

  const pets = await getAllPets({ withHidden: true });

  return { pets };
}) satisfies PageLoad;

import { updatePet, type PetResponseDto } from '@immich/sdk';
import { toastManager, type ActionItem } from '@immich/ui';
import { mdiEyeOffOutline, mdiEyeOutline, mdiHeartMinusOutline, mdiHeartOutline } from '@mdi/js';
import type { MessageFormatter } from 'svelte-i18n';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';

export const getPetActions = ($t: MessageFormatter, pet: PetResponseDto) => {
  const Favorite: ActionItem = {
    title: $t('to_favorite'),
    icon: mdiHeartOutline,
    $if: () => !pet.isFavorite,
    onAction: () => handleFavoritePet(pet),
  };

  const Unfavorite: ActionItem = {
    title: $t('unfavorite'),
    icon: mdiHeartMinusOutline,
    $if: () => !!pet.isFavorite,
    onAction: () => handleUnfavoritePet(pet),
  };

  const HidePet: ActionItem = {
    title: $t('hide_pet'),
    icon: mdiEyeOffOutline,
    $if: () => !pet.isHidden,
    onAction: () => handleHidePet(pet),
  };

  const ShowPet: ActionItem = {
    title: $t('unhide_pet'),
    icon: mdiEyeOutline,
    $if: () => !!pet.isHidden,
    onAction: () => handleShowPet(pet),
  };

  return { Favorite, Unfavorite, HidePet, ShowPet };
};

const handleFavoritePet = async (pet: { id: string }) => {
  const $t = await getFormatter();
  try {
    const response = await updatePet({ id: pet.id, petUpdateDto: { isFavorite: true } });
    eventManager.emit('PetUpdate', response);
    toastManager.primary($t('added_to_favorites'));
  } catch (error) {
    handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: false } }));
  }
};

const handleUnfavoritePet = async (pet: { id: string }) => {
  const $t = await getFormatter();
  try {
    const response = await updatePet({ id: pet.id, petUpdateDto: { isFavorite: false } });
    eventManager.emit('PetUpdate', response);
    toastManager.primary($t('removed_from_favorites'));
  } catch (error) {
    handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: false } }));
  }
};

const handleHidePet = async (pet: { id: string }) => {
  const $t = await getFormatter();
  try {
    const response = await updatePet({ id: pet.id, petUpdateDto: { isHidden: true } });
    toastManager.primary($t('changed_visibility_successfully'));
    eventManager.emit('PetUpdate', response);
  } catch (error) {
    handleError(error, $t('errors.unable_to_hide_pet'));
  }
};

const handleShowPet = async (pet: { id: string }) => {
  const $t = await getFormatter();
  try {
    const response = await updatePet({ id: pet.id, petUpdateDto: { isHidden: false } });
    toastManager.primary($t('changed_visibility_successfully'));
    eventManager.emit('PetUpdate', response);
  } catch (error) {
    handleError(error, $t('errors.something_went_wrong'));
  }
};

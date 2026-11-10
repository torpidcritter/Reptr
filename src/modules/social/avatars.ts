/** Private Supabase Storage bucket for profile pictures, one folder per person. */
export const avatarBucket = "avatars";

/** A fresh path for a new picture in the person's own folder. */
export const avatarPath = (userId: string, id: string) => `${userId}/${id}.jpg`;

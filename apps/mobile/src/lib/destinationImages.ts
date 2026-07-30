import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchLocationImages, type ApiAttributedImage } from './travel-api';

export type DestinationImageInput = {
  slug: string;
  name: string;
  heroImageUrl?: string | null;
  galleryImageUrls?: string[] | null;
};

export function useDestinationImages(destination?: DestinationImageInput | null) {
  const query = useQuery({
    queryKey: ['pexels-destination-images-v1', destination?.slug],
    queryFn: () => searchLocationImages({
      subject: destination!.name,
      destination: destination!.name,
      kind: 'destination',
      limit: 5,
    }),
    enabled: Boolean(destination?.slug && destination?.name),
    staleTime: 14 * 24 * 60 * 60_000,
    retry: 1,
  });

  const pexelsImages = query.data?.images ?? [];
  const candidates = useMemo(() => {
    const attributed = pexelsImages.map((image) => ({ url: image.url, image }));
    const editorialUrls = [
      destination?.heroImageUrl,
      ...(destination?.galleryImageUrls ?? []),
    ].filter((url): url is string => Boolean(url));
    const seen = new Set(attributed.map((item) => item.url));
    return [
      ...attributed,
      ...editorialUrls.flatMap((url) => {
        if (seen.has(url)) return [];
        seen.add(url);
        return [{ url, image: undefined as ApiAttributedImage | undefined }];
      }),
    ];
  }, [destination?.galleryImageUrls, destination?.heroImageUrl, pexelsImages]);

  return {
    ...query,
    candidates,
    pexelsImages,
    heroUrl: candidates[0]?.url,
  };
}

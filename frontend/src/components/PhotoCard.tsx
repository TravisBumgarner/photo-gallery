import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { thumbnailUrl } from '../lib/api';
import type { Photo } from '../lib/types';

interface PhotoCardProps {
  photo: Photo;
  size: number;
  onPress: (photo: Photo) => void;
}

const PhotoCard = memo(function PhotoCard({ photo, size, onPress }: PhotoCardProps) {
  const uri = thumbnailUrl(photo.thumbnailPath);
  return (
    <Pressable
      onPress={() => onPress(photo)}
      // Thumbnails stay square-cornered in every theme — the photos are the
      // content, not chrome.
      style={[styles.card, { width: size, height: size }]}
    >
      <Image
        source={{ uri }}
        placeholder={photo.blurhash ? { blurhash: photo.blurhash } : undefined}
        placeholderContentFit="cover"
        contentFit="cover"
        transition={150}
        style={StyleSheet.absoluteFill}
        recyclingKey={String(photo.id)}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    position: 'relative',
  },
});

export default PhotoCard;

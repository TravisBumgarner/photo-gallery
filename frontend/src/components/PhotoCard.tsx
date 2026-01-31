import { Box, Card, CardMedia, Typography } from '@mui/material';
import { memo, useState } from 'react';
import { Blurhash } from 'react-blurhash';
import type { Photo } from '@/types';

interface PhotoCardProps {
  photo: Photo;
  onClick: () => void;
}

const PhotoCard = memo(function PhotoCard({ photo, onClick }: PhotoCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        cursor: 'pointer',
        transition: 'transform 0.15s ease-out, box-shadow 0.15s ease-out',
        '@media (hover: hover)': {
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: 6,
          },
        },
        position: 'relative',
        willChange: isHovered ? 'transform' : 'auto',
        contain: 'layout style paint',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          paddingTop: '100%', // Force 1:1 aspect ratio (square)
          overflow: 'hidden',
          contain: 'strict',
        }}
      >
        {!imageLoaded && (
          <Box sx={{ position: 'absolute', inset: 0 }}>
            <Blurhash
              hash={photo.blurhash}
              width="100%"
              height="100%"
              resolutionX={32}
              resolutionY={32}
              punch={1}
            />
          </Box>
        )}
        <CardMedia
          component="img"
          image={photo.thumbnailPath}
          alt={photo.filename}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: imageLoaded ? 1 : 0,
            transition: 'opacity 0.3s',
          }}
        />

        {/* Hover overlay with metadata */}
        {isHovered && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: 'rgba(0, 0, 0, 0.75)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              p: 1.5,
              color: 'white',
              animation: 'fadeIn 0.15s ease-out',
              '@keyframes fadeIn': {
                from: { opacity: 0 },
                to: { opacity: 1 },
              },
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: 'bold',
                mb: 0.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {photo.filename}
            </Typography>
            {photo.camera && (
              <Typography variant="caption" sx={{ opacity: 0.9, mb: 0.25 }}>
                📷 {photo.camera}
              </Typography>
            )}
            {photo.dateCaptured && (
              <Typography variant="caption" sx={{ opacity: 0.9, mb: 0.25 }}>
                📅 {new Date(photo.dateCaptured).toLocaleDateString()}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
              {photo.iso && (
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  ISO {photo.iso}
                </Typography>
              )}
              {photo.aperture && (
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  f/{photo.aperture}
                </Typography>
              )}
              {photo.shutterSpeed && (
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  {photo.shutterSpeed}
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Card>
  );
});

export default PhotoCard;

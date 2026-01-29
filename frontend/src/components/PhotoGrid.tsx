import { Box } from '@mui/material';
import { Photo } from '../types';
import PhotoCard from './PhotoCard';

interface PhotoGridProps {
    photos: Photo[];
    onPhotoClick: (photo: Photo) => void;
}

function PhotoGrid({ photos, onPhotoClick }: PhotoGridProps) {
    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: {
                    xs: 'repeat(auto-fill, minmax(200px, 1fr))', // Mobile: 1-2 columns
                    sm: 'repeat(auto-fill, minmax(220px, 1fr))', // Tablet: 2-3 columns
                    md: 'repeat(auto-fill, minmax(240px, 1fr))', // Desktop: 3-4 columns
                    lg: 'repeat(5, 1fr)',                        // Large: exactly 5 columns
                    xl: 'repeat(5, 1fr)',                        // XL: exactly 5 columns
                },
                gap: 2,
                p: 2,
            }}
        >
            {photos.map((photo) => (
                <PhotoCard
                    key={photo.id}
                    photo={photo}
                    onClick={() => onPhotoClick(photo)}
                />
            ))}
        </Box>
    );
}

export default PhotoGrid;

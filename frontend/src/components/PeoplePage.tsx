import {
  Block as BlockIcon,
  Edit as EditIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';

interface SampleFace {
  faceId: number;
  photoUuid: string;
  thumbnailPath: string;
  bboxX: number;
  bboxY: number;
  bboxW: number;
  bboxH: number;
  detScore: number;
}

interface ClusterRow {
  id: number;
  personLabel: string | null;
  ignored: boolean;
  faceCount: number;
  sampleFaces: SampleFace[];
}

type Status = 'unlabeled' | 'labeled' | 'ignored';

const FACE_CROP_PX = 84;

// SCRFD bboxes are tight to the face (eyebrows-to-chin, no forehead). Pad
// outward so the crop looks like a normal headshot. Asymmetric: more on top
// because the detector clips the forehead, less on bottom.
const PAD_TOP = 0.6;
const PAD_BOTTOM = 0.25;
const PAD_SIDE = 0.35;

// Crops a face out of a thumbnail using positioning. bbox is normalized 0..1.
function FaceCrop({ face, size = FACE_CROP_PX }: { face: SampleFace; size?: number }) {
  const padX = face.bboxW * PAD_SIDE;
  const x = Math.max(0, face.bboxX - padX);
  const right = Math.min(1, face.bboxX + face.bboxW + padX);
  const w = Math.max(right - x, 0.001);

  const y = Math.max(0, face.bboxY - face.bboxH * PAD_TOP);
  const bottom = Math.min(1, face.bboxY + face.bboxH * (1 + PAD_BOTTOM));
  const h = Math.max(bottom - y, 0.001);

  const src = `/${face.thumbnailPath}`;
  return (
    <Tooltip
      title={
        <Box
          component="img"
          src={src}
          alt=""
          sx={{
            display: 'block',
            maxWidth: 300,
            maxHeight: 300,
            width: 'auto',
            height: 'auto',
            borderRadius: 0.5,
          }}
        />
      }
      placement="top"
      enterDelay={150}
      leaveDelay={0}
      componentsProps={{
        tooltip: {
          sx: { bgcolor: 'transparent', p: 0, maxWidth: 'none' },
        },
      }}
    >
      <Box
        sx={{
          width: size,
          height: size,
          overflow: 'hidden',
          borderRadius: 1,
          position: 'relative',
          bgcolor: 'grey.200',
          flexShrink: 0,
          cursor: 'zoom-in',
        }}
      >
        <Box
          component="img"
          src={src}
          alt=""
          loading="lazy"
          sx={{
            position: 'absolute',
            width: `${100 / w}%`,
            height: `${100 / h}%`,
            left: `${(-x * 100) / w}%`,
            top: `${(-y * 100) / h}%`,
            maxWidth: 'none',
            objectFit: 'cover',
          }}
        />
      </Box>
    </Tooltip>
  );
}

function ClusterCard({
  cluster,
  onChanged,
}: {
  cluster: ClusterRow;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(!cluster.personLabel && !cluster.ignored);
  const [name, setName] = useState(cluster.personLabel ?? '');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the name input only when the user explicitly enters edit mode (Edit
  // button), not on initial mount. preventScroll keeps the page from jumping
  // to whichever input wins focus on a list re-render.
  const skipFirstFocus = useRef(true);
  useEffect(() => {
    if (skipFirstFocus.current) {
      skipFirstFocus.current = false;
      return;
    }
    if (editing) inputRef.current?.focus({ preventScroll: true });
  }, [editing]);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(`/api/people/clusters/${cluster.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personLabel: name.trim() || null }),
      });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }, [cluster.id, name, onChanged]);

  const setIgnored = useCallback(
    async (ignored: boolean) => {
      setBusy(true);
      try {
        await fetch(`/api/people/clusters/${cluster.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ignored }),
        });
        onChanged();
      } finally {
        setBusy(false);
      }
    },
    [cluster.id, onChanged],
  );

  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: 2,
        mb: 2,
      }}
    >
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ mb: 1.5, flexWrap: 'wrap' }}
        useFlexGap
      >
        {cluster.personLabel && !editing ? (
          <Typography variant="h6">{cluster.personLabel}</Typography>
        ) : null}
        <Chip label={`${cluster.faceCount} faces`} size="small" />
        {cluster.ignored ? <Chip label="ignored" size="small" color="warning" /> : null}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }} useFlexGap>
        {cluster.sampleFaces.map((f) => (
          <FaceCrop key={f.faceId} face={f} />
        ))}
      </Stack>

      {editing ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            placeholder="Who is this? (e.g. mom, alex)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim() && !busy) save();
            }}
            disabled={busy}
            inputRef={inputRef}
          />
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            onClick={save}
            disabled={busy || !name.trim()}
          >
            Save
          </Button>
          {cluster.personLabel ? (
            <Button size="small" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          ) : (
            <Button
              size="small"
              startIcon={<BlockIcon />}
              onClick={() => setIgnored(true)}
              disabled={busy}
            >
              Ignore
            </Button>
          )}
        </Stack>
      ) : (
        <Stack direction="row" spacing={1}>
          <IconButton size="small" onClick={() => setEditing(true)} disabled={busy}>
            <EditIcon fontSize="small" />
          </IconButton>
          {cluster.ignored ? (
            <Button size="small" onClick={() => setIgnored(false)} disabled={busy}>
              Un-ignore
            </Button>
          ) : null}
        </Stack>
      )}
    </Box>
  );
}

const PAGE_SIZE = 50;

function PeoplePage() {
  const [status, setStatus] = useState<Status>('unlabeled');
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  // initialLoading: true only on first fetch per tab (shows centered spinner).
  // Subsequent refetches after a save keep the list mounted so the page doesn't
  // jump or unmount card state.
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Refetch the whole list (status changed, or a cluster was edited).
  const refresh = useCallback(() => {
    fetch(
      `/api/people/clusters?status=${status}&limit=${PAGE_SIZE}&offset=0`,
      { credentials: 'include' },
    )
      .then((res) => res.json())
      .then((data) => {
        setClusters(data.clusters ?? []);
        setHasMore(Boolean(data.hasMore));
      })
      .catch((err) => console.error('Failed to fetch clusters:', err))
      .finally(() => setInitialLoading(false));
  }, [status]);

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    fetch(
      `/api/people/clusters?status=${status}&limit=${PAGE_SIZE}&offset=${clusters.length}`,
      { credentials: 'include' },
    )
      .then((res) => res.json())
      .then((data) => {
        setClusters((prev) => [...prev, ...(data.clusters ?? [])]);
        setHasMore(Boolean(data.hasMore));
      })
      .catch((err) => console.error('Failed to load more:', err))
      .finally(() => setLoadingMore(false));
  }, [status, clusters.length]);

  // Show the big spinner whenever the tab changes; clear list so we don't
  // briefly show stale data from the previous tab.
  useEffect(() => {
    setInitialLoading(true);
    setClusters([]);
    refresh();
  }, [refresh]);

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mb: 1 }}>
        People
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Each card is a cluster of faces the system thinks are the same person.
        Name the ones you recognize; ignore the ones you don't care about.
      </Typography>
      <Tabs
        value={status}
        onChange={(_, v) => setStatus(v as Status)}
        sx={{ mb: 2 }}
      >
        <Tab label="Unlabeled" value="unlabeled" />
        <Tab label="Labeled" value="labeled" />
        <Tab label="Ignored" value="ignored" />
      </Tabs>

      {initialLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : clusters.length === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>
          {status === 'unlabeled'
            ? 'No unlabeled clusters. Run `npm run cluster-faces` after detecting faces.'
            : status === 'labeled'
              ? "No people labeled yet. Switch to 'Unlabeled' to start."
              : 'No ignored clusters.'}
        </Typography>
      ) : (
        <>
          {clusters.map((c) => (
            <ClusterCard key={c.id} cluster={c} onChanged={refresh} />
          ))}
          {hasMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
              <Button onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export default PeoplePage;

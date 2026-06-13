import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StatsFilters as StatsFiltersType } from 'shared/types';

import { apiFetch } from '../lib/api';
import { type StatsFilterKey, useSettings } from '../lib/settings';
import { SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';
import CollapsibleSection from './CollapsibleSection';
import DateRangeCalendar from './DateRangeCalendar';
import {
  ExpandSectionButton,
  FilterBadge,
  MultiSelectStringChips,
} from './FilterPanel';
import FilterListModal, { type FilterListOption } from './FilterListModal';

type ListKey = 'camera' | 'lens';

function csvCount(value: string | undefined): number {
  return value ? value.split(',').filter(Boolean).length : 0;
}

/**
 * Stats-page filter controls, mirroring the gallery's sidebar sections: a date
 * range calendar plus camera/lens multi-select chips (with an expand-to-modal
 * full picker). Options come from the same /api/photos/meta endpoint.
 */
export default function StatsFilters({
  filters,
  onChange,
  palette,
}: {
  filters: StatsFiltersType;
  onChange: (changed: Partial<StatsFiltersType>) => void;
  palette: ReturnType<typeof usePalette>;
}) {
  const { statsFilterOrder, visibleStatsFilters } = useSettings();
  const [cameras, setCameras] = useState<string[]>([]);
  const [cameraCounts, setCameraCounts] = useState<Record<string, number>>({});
  const [lenses, setLenses] = useState<string[]>([]);
  const [lensCounts, setLensCounts] = useState<Record<string, number>>({});
  const [listModal, setListModal] = useState<ListKey | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/photos/meta')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setCameras(data.cameras ?? []);
        setCameraCounts(data.cameraCounts ?? {});
        setLenses(data.lenses ?? []);
        setLensCounts(data.lensCounts ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (key: string) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const dateCount = filters.startDate || filters.endDate ? 1 : 0;

  let modalTitle = '';
  let modalOptions: FilterListOption[] = [];
  let modalValue = '';
  let onModalChange: (next: string) => void = () => {};
  if (listModal === 'camera') {
    modalTitle = 'Camera';
    modalOptions = cameras.map((c) => ({ label: c, count: cameraCounts[c] }));
    modalValue = filters.camera ?? '';
    onModalChange = (v) => onChange({ camera: v || undefined });
  } else if (listModal === 'lens') {
    modalTitle = 'Lens';
    modalOptions = lenses.map((l) => ({ label: l, count: lensCounts[l] }));
    modalValue = filters.lens ?? '';
    onModalChange = (v) => onChange({ lens: v || undefined });
  }

  const cameraCount = csvCount(filters.camera);
  const lensCount = csvCount(filters.lens);

  const renderSection = (key: StatsFilterKey) => {
    switch (key) {
      case 'date':
        return (
          <CollapsibleSection
            key="date"
            title="Date range"
            expanded={!!open.date}
            onToggle={() => toggle('date')}
            active={dateCount > 0}
            badge={
              dateCount > 0 ? (
                <FilterBadge
                  label="Date range"
                  palette={palette}
                  onClear={() =>
                    onChange({ startDate: undefined, endDate: undefined })
                  }
                />
              ) : null
            }
          >
            <DateRangeCalendar
              startDate={filters.startDate}
              endDate={filters.endDate}
              onChange={(start, end) =>
                onChange({ startDate: start, endDate: end })
              }
            />
          </CollapsibleSection>
        );
      case 'camera':
        return (
          <CollapsibleSection
            key="camera"
            title="Camera"
            expanded={!!open.camera}
            onToggle={() => toggle('camera')}
            active={cameraCount > 0}
            badge={
              cameraCount > 0 ? (
                <FilterBadge
                  label="Camera"
                  palette={palette}
                  onClear={() => onChange({ camera: undefined })}
                />
              ) : null
            }
            action={
              cameras.length > 0 ? (
                <ExpandSectionButton
                  onPress={() => setListModal('camera')}
                  palette={palette}
                  label="Expand Camera filter"
                />
              ) : undefined
            }
          >
            <MultiSelectStringChips
              options={cameras}
              value={filters.camera ?? ''}
              onChange={(v) => onChange({ camera: v || undefined })}
              palette={palette}
            />
          </CollapsibleSection>
        );
      case 'lens':
        return (
          <CollapsibleSection
            key="lens"
            title="Lens"
            expanded={!!open.lens}
            onToggle={() => toggle('lens')}
            active={lensCount > 0}
            badge={
              lensCount > 0 ? (
                <FilterBadge
                  label="Lens"
                  palette={palette}
                  onClear={() => onChange({ lens: undefined })}
                />
              ) : null
            }
            action={
              lenses.length > 0 ? (
                <ExpandSectionButton
                  onPress={() => setListModal('lens')}
                  palette={palette}
                  label="Expand Lens filter"
                />
              ) : undefined
            }
          >
            <MultiSelectStringChips
              options={lenses}
              value={filters.lens ?? ''}
              onChange={(v) => onChange({ lens: v || undefined })}
              palette={palette}
            />
          </CollapsibleSection>
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.bar}>
      {statsFilterOrder
        .filter((key) => visibleStatsFilters[key])
        .map((key) => renderSection(key))}

      {listModal ? (
        <FilterListModal
          visible
          title={modalTitle}
          options={modalOptions}
          value={modalValue}
          onChange={onModalChange}
          onClose={() => setListModal(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    padding: SPACING.SMALL,
    gap: SPACING.SMALL,
  },
});

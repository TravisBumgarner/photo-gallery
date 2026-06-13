import type { StatsResponse } from 'shared/types';

import { type StatsChartKey, useSettings } from '../lib/settings';
import { StatBarChart, StatKpi, StatLineChart } from './StatChart';

const TOP_N = 12;

/**
 * The chart-bearing portion of the stats screen. Kept in its own module so it
 * (and its `victory-native` → `react-native-skia` dependency) can be lazily
 * imported only after Skia's CanvasKit wasm has loaded on web — importing it
 * earlier would initialise Skia with no CanvasKit and break every chart.
 *
 * Which charts show, and in what order, is driven by the persisted settings.
 */
export default function StatsCharts({ stats }: { stats: StatsResponse }) {
  const { statsChartOrder, visibleStatsCharts } = useSettings();

  const renderChart = (key: StatsChartKey) => {
    switch (key) {
      case 'totalPhotos':
        return (
          <StatKpi key={key} title="Total photos" value={stats.totalPhotos} />
        );
      case 'photosOverTime':
        return (
          <StatLineChart
            key={key}
            title="Photos over time"
            data={stats.photosOverTime.map((p) => ({
              label: p.month,
              value: p.count,
            }))}
          />
        );
      case 'cameras':
        return (
          <StatBarChart
            key={key}
            title="Top cameras"
            data={stats.cameraDistribution
              .slice(0, TOP_N)
              .map((c) => ({ label: c.camera, value: c.count }))}
          />
        );
      case 'lenses':
        return (
          <StatBarChart
            key={key}
            title="Top lenses"
            data={stats.lensDistribution
              .slice(0, TOP_N)
              .map((l) => ({ label: l.lens, value: l.count }))}
          />
        );
      case 'focalLength':
        return (
          <StatBarChart
            key={key}
            title="Focal length distribution"
            data={stats.focalLengthDistribution
              .slice(0, TOP_N)
              .map((f) => ({ label: `${f.focalLength}mm`, value: f.count }))}
          />
        );
      case 'aperture':
        return (
          <StatBarChart
            key={key}
            title="Aperture distribution"
            data={stats.apertureDistribution
              .slice(0, TOP_N)
              .map((a) => ({ label: `f/${a.aperture}`, value: a.count }))}
          />
        );
      case 'iso':
        return (
          <StatBarChart
            key={key}
            title="ISO distribution"
            data={stats.isoDistribution
              .slice(0, TOP_N)
              .map((i) => ({ label: `ISO ${i.iso}`, value: i.count }))}
          />
        );
      case 'rating':
        return (
          <StatBarChart
            key={key}
            title="Rating distribution"
            data={stats.ratingDistribution.map((r) => ({
              label: r.rating === 0 ? 'Unrated' : `${r.rating}★`,
              value: r.count,
            }))}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {statsChartOrder
        .filter((key) => visibleStatsCharts[key])
        .map((key) => renderChart(key))}
    </>
  );
}

import { useAsync } from 'react-use';

import { type DataSourceInstanceListItem, type DataSourceInstanceSettings } from '@grafana/data';
import { getDataSourceInstanceList, getDataSourceInstanceSettings } from '@grafana/runtime/unstable';

import {
  SUPPORTED_EXTERNAL_PROMETHEUS_FLAVORED_RULE_SOURCE_TYPES,
  isSupportedExternalPrometheusFlavoredRulesSourceType,
  isValidRecordingRulesTarget,
} from './predicates';

type EnrichedDataSource =
  | { item: DataSourceInstanceListItem; enrichment: 'ok'; settings: DataSourceInstanceSettings }
  | { item: DataSourceInstanceListItem; enrichment: 'unavailable' };

// Settings reads are in-memory today. They need a concurrency limit once they become a request per uid.
async function enrich(items: DataSourceInstanceListItem[]): Promise<EnrichedDataSource[]> {
  const results = await Promise.allSettled(items.map((item) => getDataSourceInstanceSettings(item.uid)));

  return items.map((item, index) => {
    const result = results[index];
    return result.status === 'fulfilled' && result.value
      ? { item, enrichment: 'ok', settings: result.value }
      : { item, enrichment: 'unavailable' };
  });
}

/**
 * The data sources that accept recording rules. The items carry no `jsonData`, so callers cannot
 * re-check the condition; test membership by `uid` instead.
 */
export async function getDataSourcesWithValidRecordingTarget(): Promise<DataSourceInstanceListItem[]> {
  const listed = await getDataSourceInstanceList({
    type: [...SUPPORTED_EXTERNAL_PROMETHEUS_FLAVORED_RULE_SOURCE_TYPES],
    all: true,
  });

  // A type filter does not stop the list from appending the built-in `-- Grafana --` data source.
  const candidates = listed.filter((item) => isSupportedExternalPrometheusFlavoredRulesSourceType(item.type));

  // An absent allowAsRecordingRulesTarget means allowed, so an unreadable candidate must be dropped
  // rather than judged on default settings.
  const enriched = await enrich(candidates);

  return enriched.flatMap((ds) =>
    ds.enrichment === 'ok' && isValidRecordingRulesTarget(ds.settings) ? [ds.item] : []
  );
}

export interface DataSourcesWithValidRecordingTarget {
  items: DataSourceInstanceListItem[];
  isLoading: boolean;
  error?: Error;
}

const NO_ITEMS: DataSourceInstanceListItem[] = [];

export function useDataSourcesWithValidRecordingTarget(): DataSourcesWithValidRecordingTarget {
  const { loading, error, value } = useAsync(getDataSourcesWithValidRecordingTarget, []);

  return { items: value ?? NO_ITEMS, isLoading: loading, error };
}

import { renderHook, waitFor } from '@testing-library/react';

import { type DataSourceInstanceSettings, type DataSourceJsonData } from '@grafana/data';
import { getDataSourceInstanceList, getDataSourceInstanceSettings } from '@grafana/runtime/unstable';

import { DataSourceInstanceSettingsFactory, setupDataSources } from './mocks/fakes/DataSources';
import { getDataSourcesWithValidRecordingTarget, useDataSourcesWithValidRecordingTarget } from './narrowings';

jest.mock('@grafana/runtime/unstable', () => {
  const actual = jest.requireActual('@grafana/runtime/unstable');
  return {
    ...actual,
    getDataSourceInstanceList: jest.fn(actual.getDataSourceInstanceList),
    getDataSourceInstanceSettings: jest.fn(actual.getDataSourceInstanceSettings),
  };
});

const runtime = jest.requireActual('@grafana/runtime/unstable');
const listMock = jest.mocked(getDataSourceInstanceList);
const settingsMock = jest.mocked(getDataSourceInstanceSettings);

function dataSource(uid: string, type = 'prometheus', jsonData: DataSourceJsonData = {}) {
  return DataSourceInstanceSettingsFactory.build({ uid, name: uid, type, jsonData });
}

const grafanaBuiltIn = DataSourceInstanceSettingsFactory.build({
  uid: 'grafana',
  name: '-- Grafana --',
  type: 'grafana',
  meta: { ...DataSourceInstanceSettingsFactory.build().meta, id: 'grafana', builtIn: true },
});

function failSettingsFor(uid: string, outcome: () => Promise<DataSourceInstanceSettings | undefined>) {
  settingsMock.mockImplementation((ref, scopedVars) =>
    ref === uid ? outcome() : runtime.getDataSourceInstanceSettings(ref, scopedVars)
  );
}

afterEach(() => {
  jest.clearAllMocks();
  listMock.mockImplementation(runtime.getDataSourceInstanceList);
  settingsMock.mockImplementation(runtime.getDataSourceInstanceSettings);
});

describe('getDataSourcesWithValidRecordingTarget', () => {
  it('includes Prometheus-flavored data sources unless they opt out', async () => {
    setupDataSources(
      dataSource('unset'),
      dataSource('allowed', 'prometheus', { allowAsRecordingRulesTarget: true }),
      dataSource('opted-out', 'prometheus', { allowAsRecordingRulesTarget: false }),
      dataSource('amazon', 'grafana-amazonprometheus-datasource'),
      dataSource('azure', 'grafana-azureprometheus-datasource')
    );

    const targets = await getDataSourcesWithValidRecordingTarget();

    expect(targets.map((ds) => ds.uid).sort()).toEqual(['allowed', 'amazon', 'azure', 'unset']);
  });

  it('excludes the built-in Grafana data source that the list appends to type-filtered results', async () => {
    setupDataSources(dataSource('prom'), dataSource('loki', 'loki'), grafanaBuiltIn);

    const targets = await getDataSourcesWithValidRecordingTarget();

    expect(targets.map((ds) => ds.uid)).toEqual(['prom']);
    expect(settingsMock.mock.calls.map(([ref]) => ref)).toEqual(['prom']);
  });

  it('queries every instance of the supported types, not only those with query capabilities', async () => {
    setupDataSources(dataSource('prom'));

    await getDataSourcesWithValidRecordingTarget();

    expect(listMock).toHaveBeenCalledWith({
      type: ['prometheus', 'grafana-amazonprometheus-datasource', 'grafana-azureprometheus-datasource'],
      all: true,
    });
  });

  it('drops only the data source whose settings read rejects', async () => {
    setupDataSources(dataSource('healthy'), dataSource('broken'));
    failSettingsFor('broken', () => Promise.reject(new Error('settings request failed')));

    const targets = await getDataSourcesWithValidRecordingTarget();

    expect(targets.map((ds) => ds.uid)).toEqual(['healthy']);
  });

  it('drops a data source whose settings cannot be found instead of assuming it allows recording rules', async () => {
    setupDataSources(dataSource('healthy'), dataSource('missing'));
    failSettingsFor('missing', () => Promise.resolve(undefined));

    const targets = await getDataSourcesWithValidRecordingTarget();

    expect(targets.map((ds) => ds.uid)).toEqual(['healthy']);
  });

  it('rejects when the data source list cannot be read', async () => {
    listMock.mockRejectedValue(new Error('list request failed'));

    await expect(getDataSourcesWithValidRecordingTarget()).rejects.toThrow('list request failed');
  });
});

describe('useDataSourcesWithValidRecordingTarget', () => {
  it('reports loading with no items, then the valid targets', async () => {
    setupDataSources(dataSource('prom'), dataSource('opted-out', 'prometheus', { allowAsRecordingRulesTarget: false }));

    const { result } = renderHook(() => useDataSourcesWithValidRecordingTarget());

    expect(result.current).toEqual({ items: [], isLoading: true, error: undefined });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((ds) => ds.uid)).toEqual(['prom']);
    expect(result.current.error).toBeUndefined();
  });

  it('exposes the error when discovery fails', async () => {
    listMock.mockRejectedValue(new Error('list request failed'));

    const { result } = renderHook(() => useDataSourcesWithValidRecordingTarget());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toEqual(new Error('list request failed'));
  });
});

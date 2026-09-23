import { Factory } from 'fishery';
import { keyBy } from 'lodash';

import { type DataSourceInstanceSettings, type DataSourcePluginMeta } from '@grafana/data';
import { setDataSourceInstanceSettings } from '@grafana/runtime/internal';

export const DataSourceInstanceSettingsFactory = Factory.define<DataSourceInstanceSettings>(({ sequence }) => ({
  id: sequence,
  uid: `data-source-${sequence}`,
  name: `Data source ${sequence}`,
  type: 'prometheus',
  access: 'proxy',
  url: '',
  readOnly: false,
  jsonData: {},
  meta: { id: 'prometheus', name: 'Prometheus', type: 'datasource', alerting: true } as DataSourcePluginMeta,
}));

/**
 * Seeds the runtime data source cache that getDataSourceInstanceList and
 * getDataSourceInstanceSettings read from.
 */
export function setupDataSources(...dataSources: DataSourceInstanceSettings[]) {
  setDataSourceInstanceSettings(keyBy(dataSources, (ds) => ds.name));
}

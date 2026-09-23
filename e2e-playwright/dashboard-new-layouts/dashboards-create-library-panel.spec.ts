import { test, expect } from './fixtures';
import { flows, undockMegaMenu } from './helpers';

test.use({
  featureToggles: {
    dashboardNewLayouts: true,
  },
});

// A library panel name must be unique within its folder, so a retry or a parallel worker reusing
// one would hit the "already exists" validation instead of the flow under test.
const uniqueName = (prefix: string) => `${prefix} [${Date.now().toString(36)}-${test.info().workerIndex}]`;

test.describe(
  'Dashboard library panels',
  {
    tag: ['@dashboards'],
  },
  () => {
    test('creates a library panel from a configured dashboard panel', async ({
      gotoDashboardPage,
      selectors,
      sidebar,
      panels,
      controls,
      page,
      request,
    }) => {
      test.slow();

      const dashboardPage = await gotoDashboardPage({});
      // undock the mega menu so the panel header controls are not shrunk out of reach
      await undockMegaMenu(dashboardPage, selectors);

      // the Add options are already open in the sidebar of a new dashboard
      await sidebar.addOptions.addPanel();
      await expect(panels.getPanels('New panel')).toHaveCount(1);

      // a new panel starts unconfigured, so give it a visualization before saving it to the library
      const panelContainer = panels.getPanel('New panel');
      await panelContainer.hover();
      await panelContainer.getByRole('button', { name: /configure/i }).click();

      // a panel that has never picked a visualization opens the picker on the Suggestions tab
      // (PanelVizTypePicker.tsx:94), whose cards are not PanelTypeCards
      await dashboardPage.getByGrafanaSelector(selectors.components.Tab.title('Visualizations')).click();
      await dashboardPage.getByGrafanaSelector(selectors.components.PanelEditor.VizTypePicker.searchInput).fill('Stat');
      await dashboardPage.getByGrafanaSelector(selectors.components.PluginVisualization.item('Stat')).click();

      const panelTitle = uniqueName('Library panel source');
      await sidebar.panelOptions.setTitle(panelTitle);
      await dashboardPage
        .getByGrafanaSelector(selectors.components.NavToolbar.editDashboard.backToDashboardButton)
        .click();
      await expect(panels.getPanels(panelTitle)).toHaveCount(1);

      await panels.selectMenuItem(panelTitle, ['More...', 'New library panel']);

      // the drawer seeds the library panel name from the panel title
      const nameField = dashboardPage.getByGrafanaSelector(selectors.components.Drawer.NewLibraryPanelDrawer.nameInput);
      await expect(nameField).toHaveValue(panelTitle);

      await dashboardPage.getByGrafanaSelector(selectors.components.Drawer.NewLibraryPanelDrawer.createButton).click();
      await expect(nameField).toBeHidden();

      const response = await request.get(`/api/library-elements?searchString=${encodeURIComponent(panelTitle)}`);
      expect(response.ok()).toBe(true);
      const created = (await response.json()).result.elements;
      expect(created).toHaveLength(1);
      expect(created[0].name).toBe(panelTitle);
      expect(created[0].type).toBe('stat');

      // saving proves the link is in the dashboard model, not just in the scene
      await flows.dashboards.saveDashboard(page, controls, { title: 'Library panel host' });

      const uid = new URL(page.url()).pathname.split('/')[2];
      const dashboard = await (await request.get(`/api/dashboards/uid/${uid}`)).json();
      const [savedPanel] = dashboard.dashboard.panels;
      expect(savedPanel.libraryPanel.uid).toBe(created[0].uid);
      expect(savedPanel.libraryPanel.name).toBe(panelTitle);
    });
  }
);

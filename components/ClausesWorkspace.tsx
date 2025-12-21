/**
 * Clauses Workspace
 *
 * This is the "Clauses" tab content on the Title Page.
 * It contains the 3 sub-tabs: Upload Word File / Export to Excel / Excel Processor.
 *
 * Note: Upload + Export are two views over the same Word Processor component;
 * the Export tab is mainly a convenience entry point.
 */

import { useMemo, useState } from 'react';
import { Box, Paper, Tabs, Tab } from '@mui/material';
import WordProcessor from '@/components/WordProcessor';
import ExcelProcessor from '@/components/ExcelProcessor';

type ClausesSubTab = 'upload' | 'export' | 'excel';

export default function ClausesWorkspace() {
  const [subTab, setSubTab] = useState<ClausesSubTab>('upload');

  const tabs = useMemo(() => ([
    { value: 'upload' as const, label: 'Upload Word File' },
    { value: 'export' as const, label: 'Export to Excel' },
    { value: 'excel' as const, label: 'Excel Processor' },
  ]), []);

  return (
    <Box>
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={subTab}
          onChange={(_, nextValue) => setSubTab(nextValue as ClausesSubTab)}
          variant="fullWidth"
        >
          {tabs.map(t => (
            <Tab key={t.value} value={t.value} label={t.label} />
          ))}
        </Tabs>
      </Paper>

      {/* Upload + Export are the same underlying workspace; Export tab is a shortcut. */}
      {(subTab === 'upload' || subTab === 'export') && (
        <WordProcessor />
      )}

      {subTab === 'excel' && (
        <ExcelProcessor />
      )}
    </Box>
  );
}



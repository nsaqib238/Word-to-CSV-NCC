/**
 * Clauses Workspace
 *
 * This is the "Clauses" tab content on the Title Page.
 * It contains 2 sub-tabs: Upload Word File / Excel Processor.
 */

import { useMemo, useState } from 'react';
import { Box, Paper, Tabs, Tab } from '@mui/material';
import WordProcessor from '@/components/WordProcessor';
import ExcelProcessor from '@/components/ExcelProcessor';

type ClausesSubTab = 'upload' | 'excel';

export default function ClausesWorkspace() {
  const [subTab, setSubTab] = useState<ClausesSubTab>('upload');

  const tabs = useMemo(() => ([
    { value: 'upload' as const, label: 'Upload Word File' },
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

      {/* Keep component mounted to preserve state across tab switches */}
      {subTab === 'upload' && (
        <WordProcessor />
      )}

      {subTab === 'excel' && (
        <ExcelProcessor />
      )}
    </Box>
  );
}



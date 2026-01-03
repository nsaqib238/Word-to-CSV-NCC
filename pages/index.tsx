/**
 * Title Page
 *
 * Main application with top-level tabs: Word Processor and NCC Processor
 */

import { useState, useMemo } from 'react';
import { Container, Paper, Tabs, Tab, Box } from '@mui/material';
import ClausesWorkspace from '@/components/ClausesWorkspace';
import NCCProcessor from '@/components/NCCProcessor';

type MainTab = 'word-processor' | 'ncc-processor';

export default function Home() {
  const [mainTab, setMainTab] = useState<MainTab>('word-processor');

  const tabs = useMemo(() => ([
    { value: 'word-processor' as const, label: 'Word Processor' },
    { value: 'ncc-processor' as const, label: 'NCC Processor' },
  ]), []);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={mainTab}
          onChange={(_, nextValue) => setMainTab(nextValue as MainTab)}
          variant="fullWidth"
        >
          {tabs.map(t => (
            <Tab key={t.value} value={t.value} label={t.label} />
          ))}
        </Tabs>
      </Paper>

      <Box>
        {mainTab === 'word-processor' && (
      <ClausesWorkspace />
        )}

        {mainTab === 'ncc-processor' && (
          <NCCProcessor />
        )}
      </Box>
    </Container>
  );
}


/**
 * Title Page
 *
 * Clauses workspace with sub-tabs for upload, export, and Excel
 */

import { Container } from '@mui/material';
import ClausesWorkspace from '@/components/ClausesWorkspace';

export default function Home() {
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <ClausesWorkspace />
    </Container>
  );
}


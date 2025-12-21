/**
 * Excel Processor Page (standalone route)
 *
 * This wraps the extracted component so the original URL keeps working.
 */

import { Container, Paper, Typography, Box, Button } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import NextLink from 'next/link';
import ExcelProcessor from '@/components/ExcelProcessor';

export default function ExcelProcessorPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper sx={{ p: 3, mb: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h4" component="h1">
            Excel Processor
          </Typography>
          <NextLink href="/" passHref>
            <Button
              startIcon={<ArrowBackIcon />}
              variant="outlined"
              size="small"
            >
              Back to Title Page
            </Button>
          </NextLink>
        </Box>
        <Typography variant="body1" color="text.secondary">
          Upload an Excel file exported from the word processor, review and fine-tune it,
          then export it as <code>clauses_cleaned.csv</code> for database upload.
        </Typography>
      </Paper>

      <ExcelProcessor />
    </Container>
  );
}

/**
 * NCC Processor Component
 *
 * Converts NCC DOCX files to Excel with minimal columns
 */

import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
} from '@mui/material';
import {
  Upload as UploadIcon,
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';

type VolumeType = 'Vol1' | 'Vol2' | 'Vol3';

interface ProcessingStats {
  stage: string;
  message: string;
}

interface NCCResult {
  filename: string;
  stats: {
    paragraphs: number;
    tableCells: number;
    totalRows: number;
  };
}

export default function NCCProcessor() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [volume, setVolume] = useState<VolumeType>('Vol2');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingStats, setProcessingStats] = useState<ProcessingStats | null>(null);
  const [result, setResult] = useState<NCCResult | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.docx')) {
        setError('Please select a .docx file');
        return;
      }
      setSelectedFile(file);
      setError(null);
      setResult(null);
    }
  };

  const handleProcess = async (format: 'excel' | 'csv' = 'excel') => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    setLoading(true);
    setError(null);
    setProcessingStats({ stage: 'Uploading...', message: 'Preparing file upload' });
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('volume', volume);
      formData.append('format', format);

      setProcessingStats({ stage: 'Processing...', message: `Converting DOCX to ${format.toUpperCase()}` });

      const response = await fetch('/api/process-ncc-to-excel', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Processing failed');
      }

      const data = await response.json();
      
      // Convert base64 buffer to blob
      const binaryString = atob(format === 'csv' ? data.csvBuffer : data.excelBuffer);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const mimeType = format === 'csv' 
        ? 'text/csv' 
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      
      const blob = new Blob([bytes], { type: mimeType });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setResult({
        filename: data.filename,
        stats: data.stats,
      });

      setProcessingStats({
        stage: 'Complete',
        message: `Successfully exported ${data.stats.totalRows} rows (${data.stats.paragraphs} paragraphs, ${data.stats.tableCells} table cells) to ${format.toUpperCase()}`,
      });

    } catch (err: any) {
      setError(err.message || 'An error occurred during processing');
      setProcessingStats(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          NCC Processor
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Convert NCC Volume 1/2/3 Word (.docx) files to Excel with minimal columns.
          All paragraphs and table cells are extracted to ensure no content is missed.
        </Typography>
      </Paper>

      {/* Configuration */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          1. Select Volume
        </Typography>
        
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>NCC Volume</InputLabel>
          <Select
            value={volume}
            label="NCC Volume"
            onChange={(e) => setVolume(e.target.value as VolumeType)}
          >
            <MenuItem value="Vol1">Volume 1 - Class 2-9 Buildings</MenuItem>
            <MenuItem value="Vol2">Volume 2 - Class 1 & 10 Buildings</MenuItem>
            <MenuItem value="Vol3">Volume 3 - Plumbing Code</MenuItem>
          </Select>
        </FormControl>

        {/* File Upload */}
        <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
          2. Upload NCC DOCX File
        </Typography>
        
        <Box sx={{ mt: 2 }}>
          <input
            accept=".docx"
            style={{ display: 'none' }}
            id="ncc-file-upload"
            type="file"
            onChange={handleFileChange}
          />
          <label htmlFor="ncc-file-upload">
            <Button
              variant="outlined"
              component="span"
              startIcon={<UploadIcon />}
              fullWidth
              sx={{ mb: 2 }}
            >
              Select DOCX File
            </Button>
          </label>

          {selectedFile && (
            <Alert severity="info" icon={<DescriptionIcon />}>
              <Typography variant="body2">
                <strong>Selected:</strong> {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </Typography>
            </Alert>
          )}
        </Box>
      </Paper>

      {/* Export Options */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          3. Export Options
        </Typography>
        
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button
            variant="contained"
            onClick={() => handleProcess('excel')}
            disabled={!selectedFile || loading}
            startIcon={loading ? <CircularProgress size={20} /> : <CheckCircleIcon />}
            fullWidth
          >
            Export to Excel
          </Button>
          
          <Button
            variant="contained"
            color="secondary"
            onClick={() => handleProcess('csv')}
            disabled={!selectedFile || loading}
            startIcon={loading ? <CircularProgress size={20} /> : <DownloadIcon />}
            fullWidth
          >
            Export to CSV
          </Button>
        </Stack>
        
        {!selectedFile && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Please select a DOCX file first
          </Alert>
        )}

        {loading && processingStats && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {processingStats.stage}
            </Typography>
            <LinearProgress variant="indeterminate" sx={{ mb: 1 }} />
            <Typography variant="caption" color="text.secondary">
              {processingStats.message}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Error Display */}
      {error && (
        <Alert severity="error" icon={<ErrorIcon />} sx={{ mb: 3 }}>
          <Typography variant="body2">{error}</Typography>
        </Alert>
      )}

      {/* Results */}
      {result && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom color="success.main">
            ✅ Conversion Complete
          </Typography>
          
          <Stack spacing={2} mt={2}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Total Rows Exported
              </Typography>
              <Typography variant="h4" color="primary">
                {result.stats.totalRows.toLocaleString()}
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Paragraphs
              </Typography>
              <Typography variant="h6">
                {result.stats.paragraphs.toLocaleString()}
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Table Cells
              </Typography>
              <Typography variant="h6">
                {result.stats.tableCells.toLocaleString()}
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Output File
              </Typography>
              <Typography variant="body1">
                {result.filename}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      )}

      {/* Help Section */}
      <Paper sx={{ p: 3, bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" gutterBottom>
          📖 Excel Output Columns
        </Typography>
        <Typography variant="body2" color="text.secondary" component="div">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>volume</strong> - Vol1, Vol2, or Vol3</li>
            <li><strong>row_type</strong> - paragraph or table_cell</li>
            <li><strong>heading_level</strong> - H1, H2, H3, H4, or blank</li>
            <li><strong>heading_text</strong> - Heading text (if applicable)</li>
            <li><strong>unit_type</strong> - PERFORMANCE_REQUIREMENT, DTS_PROVISION, VERIFICATION_METHOD, EVIDENCE_OF_SUITABILITY, DEFINITION, or OTHER</li>
            <li><strong>clause_ref</strong> - Extracted clause reference (e.g., H4D3, P2.1) or blank</li>
            <li><strong>text</strong> - The actual content text</li>
            <li><strong>source_location</strong> - Paragraph index or table location for tracing</li>
          </ul>
        </Typography>
      </Paper>
    </Box>
  );
}

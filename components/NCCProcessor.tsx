/**
 * NCC Processor Component
 *
 * Allows users to upload NCC 2022 DOCX files (Volumes 1, 2, 3)
 * and generate structured CSV files for database loading.
 *
 * Features:
 * - Volume selection (Volume One, Two, Three)
 * - File upload with progress tracking
 * - Real-time processing status
 * - CSV download
 * - Quality gate reporting
 */

import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Alert,
  CircularProgress,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Chip,
  Stack,
  Divider,
} from '@mui/material';
import {
  Upload as UploadIcon,
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';

interface ProcessingStats {
  stage: string;
  progress: number;
  message: string;
  extractedUnits?: number;
  fileSize?: string;
  qualityGates?: string[];
}

interface NCCResult {
  csvData: string;
  filename: string;
  stats: {
    totalUnits: number;
    unitTypes: Record<string, number>;
    stateVariations: number;
    fileSizeMB: number;
  };
}

type VolumeType = 'Volume One' | 'Volume Two' | 'Volume Three';

export default function NCCProcessor() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [volume, setVolume] = useState<VolumeType>('Volume Two');
  const [docId, setDocId] = useState('ncc2022');
  const [versionDate, setVersionDate] = useState('2022');
  
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

  const handleProcess = async () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    setLoading(true);
    setError(null);
    setProcessingStats({ stage: 'Uploading...', progress: 0, message: 'Preparing file upload' });
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('volume', volume);
      formData.append('docId', docId);
      formData.append('versionDate', versionDate);

      const response = await fetch('/api/process-ncc', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Processing failed');
      }

      const data = await response.json();
      
      setResult({
        csvData: data.csvData,
        filename: data.filename,
        stats: data.stats,
      });

      setProcessingStats({
        stage: 'Complete',
        progress: 100,
        message: `Successfully extracted ${data.stats.totalUnits} NCC units`,
        extractedUnits: data.stats.totalUnits,
        qualityGates: ['All quality gates passed'],
      });

    } catch (err: any) {
      setError(err.message || 'An error occurred during processing');
      setProcessingStats(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;

    const blob = new Blob([result.csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', result.filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getVolumeInfo = (vol: VolumeType) => {
    const info = {
      'Volume One': {
        description: 'Class 2-9 Buildings (Commercial, Industrial, Public)',
        sections: 'Sections A-H',
        expectedSize: '~8,000-10,000 units',
        warning: 'Large file - may require 16GB+ memory',
      },
      'Volume Two': {
        description: 'Class 1 & 10 Buildings (Housing, Sheds)',
        sections: 'Parts H1-H8',
        expectedSize: '~4,500-5,000 units',
        warning: null,
      },
      'Volume Three': {
        description: 'Plumbing Code',
        sections: 'Sections A-F (Water, Sanitary, Stormwater)',
        expectedSize: '~5,000-6,000 units',
        warning: null,
      },
    };
    return info[vol];
  };

  const volumeInfo = getVolumeInfo(volume);

  return (
    <Box>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          NCC 2022 Document Processor
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Upload NCC DOCX files and generate structured CSV files with 72-column schema
          for database loading. Extracts all clause types, state variations, and compliance hierarchies.
        </Typography>
      </Paper>

      {/* Configuration */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          1. Configure Processing
        </Typography>
        
        <Stack spacing={3}>
          {/* Volume Selection */}
          <FormControl fullWidth>
            <InputLabel>NCC Volume</InputLabel>
            <Select
              value={volume}
              label="NCC Volume"
              onChange={(e) => setVolume(e.target.value as VolumeType)}
            >
              <MenuItem value="Volume One">Volume One - Class 2-9 Buildings</MenuItem>
              <MenuItem value="Volume Two">Volume Two - Class 1 & 10 Buildings</MenuItem>
              <MenuItem value="Volume Three">Volume Three - Plumbing Code</MenuItem>
            </Select>
          </FormControl>

          {/* Volume Info Card */}
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                {volume}
              </Typography>
              <Typography variant="body2" paragraph>
                {volumeInfo.description}
              </Typography>
              <Stack direction="row" spacing={1} mb={1}>
                <Chip label={volumeInfo.sections} size="small" />
                <Chip label={volumeInfo.expectedSize} size="small" color="info" />
              </Stack>
              {volumeInfo.warning && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {volumeInfo.warning}
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Document ID and Version */}
          <Stack direction="row" spacing={2}>
            <TextField
              label="Document ID"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              fullWidth
              helperText="e.g., ncc2022"
            />
            <TextField
              label="Version Year"
              value={versionDate}
              onChange={(e) => setVersionDate(e.target.value)}
              fullWidth
              helperText="e.g., 2022"
            />
          </Stack>
        </Stack>
      </Paper>

      {/* File Upload */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
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

      {/* Process Button */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          3. Generate CSV
        </Typography>
        
        <Button
          variant="contained"
          color="primary"
          size="large"
          fullWidth
          onClick={handleProcess}
          disabled={!selectedFile || loading}
          startIcon={loading ? <CircularProgress size={20} /> : <CheckCircleIcon />}
        >
          {loading ? 'Processing...' : 'Process NCC Document'}
        </Button>

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
            ✅ Processing Complete
          </Typography>
          
          <Divider sx={{ my: 2 }} />

          {/* Stats */}
          <Stack spacing={2} mb={3}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Total NCC Units Extracted
              </Typography>
              <Typography variant="h4" color="primary">
                {result.stats.totalUnits.toLocaleString()}
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Unit Type Breakdown
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {Object.entries(result.stats.unitTypes)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([type, count]) => (
                    <Chip
                      key={type}
                      label={`${type}: ${count}`}
                      size="small"
                      variant="outlined"
                    />
                  ))}
              </Stack>
            </Box>

            {result.stats.stateVariations > 0 && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  State Variations
                </Typography>
                <Typography variant="h6">
                  {result.stats.stateVariations}
                </Typography>
              </Box>
            )}

            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                CSV File Size
              </Typography>
              <Typography variant="body1">
                {result.stats.fileSizeMB.toFixed(2)} MB
              </Typography>
            </Box>
          </Stack>

          {/* Download Button */}
          <Button
            variant="contained"
            color="success"
            size="large"
            fullWidth
            startIcon={<DownloadIcon />}
            onClick={handleDownload}
          >
            Download {result.filename}
          </Button>
        </Paper>
      )}

      {/* Help Section */}
      <Paper sx={{ p: 3, bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" gutterBottom>
          📖 Processing Information
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          • <strong>Volume 2 (3.4 MB)</strong>: ~90 seconds processing time<br />
          • <strong>Volume 3 (3.8 MB)</strong>: ~100 seconds processing time<br />
          • <strong>Volume 1 (7.2 MB)</strong>: May timeout in browser - use command-line script<br />
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The generated CSV contains 72 columns including unit labels, types, compliance weights,
          text content, state variations, and hierarchical relationships. Ready for direct import
          into PostgreSQL or MySQL databases.
        </Typography>
      </Paper>
    </Box>
  );
}

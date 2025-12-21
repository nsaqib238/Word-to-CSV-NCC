#!/bin/bash
# NCC Volume 1 Test Processing Script
# Filters out Rails error noise and runs clean NCC processing

set -e

echo "=========================================="
echo "NCC Volume 1 Processing Test"
echo "=========================================="
echo ""

# Create output directory
mkdir -p output/ncc_test

echo "Input file: ncc2022-volume-one.docx"
echo "Output file: output/ncc_test/ncc_v1.csv"
echo ""
echo "Processing... (this may take 30-60 seconds for 7.2MB file)"
echo ""

# Run the processing script, filtering stderr to only show real errors
npx tsx scripts/generate-ncc-csv.ts \
  --input ncc2022-volume-one.docx \
  --out output/ncc_test/ncc_v1.csv \
  --doc_id "ncc2022" \
  --volume "Volume One" \
  --state_variation "" \
  --version_date "2022" \
  2>&1 | grep -v "ActionController" | grep -v "<!DOCTYPE" | grep -v "clacky-source" | grep -v "gems/actionpack" || true

echo ""
echo "=========================================="
echo "Processing Complete"
echo "=========================================="
echo ""

# Check if output file was created
if [ -f "output/ncc_test/ncc_v1.csv" ]; then
  echo "✅ Success! CSV file created."
  echo ""
  echo "File size: $(du -h output/ncc_test/ncc_v1.csv | cut -f1)"
  echo "Row count: $(wc -l < output/ncc_test/ncc_v1.csv)"
  echo ""
  echo "First 5 rows (header + 4 data rows):"
  head -5 output/ncc_test/ncc_v1.csv
  echo ""
  echo "Column names:"
  head -1 output/ncc_test/ncc_v1.csv | tr ',' '\n' | nl
else
  echo "❌ Error: CSV file was not created"
  exit 1
fi

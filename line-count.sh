#!/bin/sh

# Directories to ignore (space-separated)
IGNORE_DIRS="node_modules dist dist-web dist-native build .git frontend/ios frontend/android explorations"

# Extensions to ignore (space-separated, no leading dot)
IGNORE_EXTS="csv jpg png gif svg mp4 mp3 zip gz tar lock ttf woff woff2 xml jar webp json"

# Filenames to ignore (space-separated, no paths)
IGNORE_FILES="package-lock.json"

# Build the exclude pattern for grep
EXCLUDE_PATTERN=""
for d in $IGNORE_DIRS; do
  EXCLUDE_PATTERN="$EXCLUDE_PATTERN|^$d/"
done
for e in $IGNORE_EXTS; do
  EXCLUDE_PATTERN="$EXCLUDE_PATTERN|\\.$e\$"
done
for f in $IGNORE_FILES; do
  EXCLUDE_PATTERN="$EXCLUDE_PATTERN|/$(echo "$f" | sed 's/\./\\./g')\$"
done
EXCLUDE_PATTERN="${EXCLUDE_PATTERN#|}"

# Get tracked files, filter out ignores
FILES=$(git ls-files | grep -Ev "$EXCLUDE_PATTERN")

# Count lines per extension
raw_counts=$(
  for f in $FILES; do
    if [ -f "$f" ]; then
      base=$(basename "$f")
      ext="${base##*.}"

      # Must have a dot that's not the first char, and not equal to basename
      if [ "$ext" != "$base" ] && [ "${base%.*}" != "" ]; then
        lines=$(wc -l < "$f")
        echo "$ext $lines"
      fi
    fi
  done | awk '
    { count[$1]+=$2; total+=$2 }
    END {
      for (e in count) print e, count[e]
      print "TOTAL", total
    }'
)

# Function for adding commas
add_commas() {
  echo "$1" | awk '{
    n=$1
    s=""
    while (n >= 1000) {
      s = sprintf(",%03d", n % 1000) s
      n = int(n / 1000)
    }
    s = n s
    print s
  }'
}

# Format numbers with commas
formatted_counts=$(
  echo "$raw_counts" | while read -r ext num; do
    numfmt=$(add_commas "$num")
    echo "$ext $numfmt"
  done
)

# Calculate widths including TOTAL line
maxext=$(echo "$formatted_counts" | awk '{ if(length($1)>m) m=length($1)} END{print m}')
maxnum=$(echo "$formatted_counts" | awk '{ if(length($2)>m) m=length($2)} END{print m}')

# Print sorted extensions (excluding TOTAL)
echo "$formatted_counts" | grep -v '^TOTAL' | sort | \
  awk -v maxext="$maxext" -v maxnum="$maxnum" \
  '{ printf "%-"maxext"s % "maxnum"s\n", $1, $2 }'

# Separator
dashlen=$((maxext + 1 + maxnum))
printf '%*s\n' "$dashlen" '' | tr ' ' '-'

# Print TOTAL with same alignment
echo "$formatted_counts" | grep '^TOTAL' | \
  awk -v maxext="$maxext" -v maxnum="$maxnum" \
  '{ printf "%-"maxext"s % "maxnum"s\n", $1, $2 }'
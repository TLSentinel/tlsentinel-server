#!/bin/bash
# TLSentinel Full-Stack PKI Generator

# Setup directory structure
#!/bin/bash
# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
# Define output relative to project root (one level up from scripts/)
OUTPUT_DIR="$SCRIPT_DIR/../testdata/certs"

mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

# Helper for leaf generation to keep script clean
# Usage: generate_leaf "FamilyName" "Subj" "CA_Base_Name" "Days" "KeyType"
generate_leaf() {
    local family=$1; local subj=$2; local ca=$3; local days=$4; local type=$5
    echo " -> Creating Leaf: $subj"
    if [ "$type" == "ecdsa" ]; then
        openssl ecparam -name prime256v1 -genkey -noout -out "${family}_leaf_${subj// /_}.key"
    else
        openssl genrsa -out "${family}_leaf_${subj// /_}.key" 2048
    fi
    
    openssl req -new -key "${family}_leaf_${subj// /_}.key" \
        -subj "/CN=TLSentinel $family Leaf - $subj" -out "${family}_leaf_${subj// /_}.csr"
    
    openssl x509 -req -in "${family}_leaf_${subj// /_}.csr" -CA "${ca}.crt" -CAkey "${ca}.key" \
        -CAcreateserial -out "${family}_leaf_${subj// /_}.crt" -days "$days" -sha256
}

# ---------------------------------------------------------
# FAMILY ALPHA: THE RSA STANDARD (Root -> Inter -> Leaf)
# ---------------------------------------------------------
echo "Generating Family Alpha..."
openssl genrsa -out alpha_root.key 4096
openssl req -x509 -new -nodes -key alpha_root.key -sha256 -days 3650 \
    -subj "/CN=TLSentinel Alpha Root - RSA 4096" -out alpha_root.crt

# Alpha Intermediate
openssl genrsa -out alpha_inter.key 2048
openssl req -new -key alpha_inter.key -subj "/CN=TLSentinel Alpha Intermediate" -out alpha_inter.csr
openssl x509 -req -in alpha_inter.csr -CA alpha_root.crt -CAkey alpha_root.key \
    -CAcreateserial -out alpha_inter.crt -days 730 -sha256

# Alpha Leaf
generate_leaf "Alpha" "Production Web" "alpha_inter" 365 "rsa"

# ---------------------------------------------------------
# FAMILY BETA: THE NESTED ECDSA (Root -> Inter1 -> Inter2 -> Leaf)
# ---------------------------------------------------------
echo "Generating Family Beta (Deep Chain)..."
openssl ecparam -name secp384r1 -genkey -noout -out beta_root.key
openssl req -x509 -new -nodes -key beta_root.key -sha384 -days 3650 \
    -subj "/CN=TLSentinel Beta Root - ECDSA P384" -out beta_root.crt

openssl ecparam -name prime256v1 -genkey -noout -out beta_inter_lvl1.key
openssl req -new -key beta_inter_lvl1.key -subj "/CN=TLSentinel Beta Inter Lvl 1" -out beta_inter_lvl1.csr
openssl x509 -req -in beta_inter_lvl1.csr -CA beta_root.crt -CAkey beta_root.key \
    -CAcreateserial -out beta_inter_lvl1.crt -days 1000 -sha256

openssl genrsa -out beta_inter_lvl2.key 2048
openssl req -new -key beta_inter_lvl2.key -subj "/CN=TLSentinel Beta Inter Lvl 2" -out beta_inter_lvl2.csr
openssl x509 -req -in beta_inter_lvl2.csr -CA beta_inter_lvl1.crt -CAkey beta_inter_lvl1.key \
    -CAcreateserial -out beta_inter_lvl2.crt -days 500 -sha256

# Beta Leaf (Signed by the deep intermediate)
generate_leaf "Beta" "Deep API" "beta_inter_lvl2" 90 "ecdsa"

# ---------------------------------------------------------
# FAMILY GAMMA: THE CRITICAL (Short-lived Leaf)
# ---------------------------------------------------------
echo "Generating Family Gamma (Critical Alert)..."
openssl genrsa -out gamma_root.key 2048
openssl req -x509 -new -nodes -key gamma_root.key -sha256 -days 365 \
    -subj "/CN=TLSentinel Gamma Root" -out gamma_root.crt

# Gamma Leaf (Expiring in 12 hours for immediate alerts)
# Note: Using 1 day as OpenSSL days is integer based
generate_leaf "Gamma" "Expiring Soon" "gamma_root" 1 "rsa"

# ---------------------------------------------------------
# FAMILY DELTA: THE EXPIRED (Historical Test)
# ---------------------------------------------------------
echo "Generating Family Delta (Already Expired)..."
openssl genrsa -out delta_root.key 2048
openssl req -x509 -new -nodes -key delta_root.key -sha256 -days 365 \
    -subj "/CN=TLSentinel Delta Root" -out delta_root.crt

# Create a leaf and backdate it using -startdate
# Format: YYMMDDHHMMSSZ
openssl genrsa -out delta_leaf_expired.key 2048
openssl req -new -key delta_leaf_expired.key -subj "/CN=TLSentinel Delta Leaf - Already Expired" -out delta_leaf_expired.csr
openssl x509 -req -in delta_leaf_expired.csr -CA delta_root.crt -CAkey delta_root.key \
    -CAcreateserial -out delta_leaf_expired.crt -startdate 230101000000Z -enddate 240101000000Z -sha256

echo "------------------------------------------------"
echo "PKI Suite with Leafs Generated Successfully!"
echo "Families: Alpha (RSA), Beta (Nested ECDSA), Gamma (Critical), Delta (Expired)"
echo "Check the 'testdata/certs' directory for all generated keys and certificates."
echo "------------------------------------------------"
echo

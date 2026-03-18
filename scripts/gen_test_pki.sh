#!/bin/bash
# TLSentinel Full PKI Suite - Modern OpenSSL Compatible
# Generates: Alpha (RSA), Beta (Nested ECDSA), Gamma (Short-lived), Delta (Expired)

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
OUTPUT_DIR="$SCRIPT_DIR/../testdata/certs"
mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

# --- Setup temporary CA config for backdating/signing ---
cat > test_ca.conf <<EOF
[ ca ]
default_ca = TLSentinel_CA
[ TLSentinel_CA ]
dir = .
database = ./index.txt
new_certs_dir = .
serial = ./serial
default_md = sha256
policy = policy_anything
[ policy_anything ]
commonName = supplied
[ v3_inter ]
basicConstraints = critical,CA:TRUE
keyUsage = critical, digitalSignature, cRLSign, keyCertSign
[ v3_leaf ]
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
EOF

touch index.txt
echo 1000 > serial

# ---------------------------------------------------------
# FAMILY ALPHA: THE RSA STANDARD (Root -> Inter -> Leaf)
# ---------------------------------------------------------
echo "Generating Family Alpha (RSA)..."
openssl genrsa -out alpha_root.key 4096
openssl req -x509 -new -nodes -key alpha_root.key -sha256 -days 3650 \
    -subj "/CN=TLSentinel Alpha Root - RSA 4096" -out alpha_root.crt

openssl genrsa -out alpha_inter.key 2048
openssl req -new -key alpha_inter.key -subj "/CN=TLSentinel Alpha Intermediate" -out alpha_inter.csr
openssl x509 -req -in alpha_inter.csr -CA alpha_root.crt -CAkey alpha_root.key \
    -CAcreateserial -out alpha_inter.crt -days 730 -extensions v3_inter -extfile test_ca.conf

openssl genrsa -out alpha_leaf_prod.key 2048
openssl req -new -key alpha_leaf_prod.key -subj "/CN=TLSentinel Alpha Leaf - Production" -out alpha_leaf_prod.csr
openssl x509 -req -in alpha_leaf_prod.csr -CA alpha_inter.crt -CAkey alpha_inter.key \
    -CAcreateserial -out alpha_leaf_prod.crt -days 365 -extensions v3_leaf -extfile test_ca.conf

# ---------------------------------------------------------
# FAMILY BETA: THE NESTED ECDSA (Root -> Inter1 -> Inter2 -> Leaf)
# ---------------------------------------------------------
echo "Generating Family Beta (Deep Chain)..."
openssl ecparam -name secp384r1 -genkey -noout -out beta_root.key
openssl req -x509 -new -nodes -key beta_root.key -sha384 -days 3650 \
    -subj "/CN=TLSentinel Beta Root - ECDSA P384" -out beta_root.crt

openssl ecparam -name prime256v1 -genkey -noout -out beta_inter_lvl1.key
openssl req -new -key beta_inter_lvl1.key -subj "/CN=TLSentinel Beta Inter Level 1" -out beta_inter_lvl1.csr
openssl x509 -req -in beta_inter_lvl1.csr -CA beta_root.crt -CAkey beta_root.key \
    -CAcreateserial -out beta_inter_lvl1.crt -days 1000 -extensions v3_inter -extfile test_ca.conf

openssl genrsa -out beta_inter_lvl2.key 2048
openssl req -new -key beta_inter_lvl2.key -subj "/CN=TLSentinel Beta Inter Level 2" -out beta_inter_lvl2.csr
openssl x509 -req -in beta_inter_lvl2.csr -CA beta_inter_lvl1.crt -CAkey beta_inter_lvl1.key \
    -CAcreateserial -out beta_inter_lvl2.crt -days 500 -extensions v3_inter -extfile test_ca.conf

openssl genrsa -out beta_leaf_deep.key 2048
openssl req -new -key beta_leaf_deep.key -subj "/CN=TLSentinel Beta Leaf - Deep API" -out beta_leaf_deep.csr
openssl x509 -req -in beta_leaf_deep.csr -CA beta_inter_lvl2.crt -CAkey beta_inter_lvl2.key \
    -CAcreateserial -out beta_leaf_deep.crt -days 90 -extensions v3_leaf -extfile test_ca.conf

# ---------------------------------------------------------
# FAMILY GAMMA: THE CRITICAL (Short-lived Leaf)
# ---------------------------------------------------------
echo "Generating Family Gamma (Short-lived)..."
openssl genrsa -out gamma_root.key 2048
openssl req -x509 -new -nodes -key gamma_root.key -sha256 -days 365 \
    -subj "/CN=TLSentinel Gamma Root" -out gamma_root.crt

openssl genrsa -out gamma_leaf_critical.key 2048
openssl req -new -key gamma_leaf_critical.key -subj "/CN=TLSentinel Gamma Leaf - Expiring Soon" -out gamma_leaf_critical.csr
openssl x509 -req -in gamma_leaf_critical.csr -CA gamma_root.crt -CAkey gamma_root.key \
    -CAcreateserial -out gamma_leaf_critical.crt -days 1 -extensions v3_leaf -extfile test_ca.conf

# ---------------------------------------------------------
# FAMILY DELTA: THE EXPIRED (Modern Fix)
# ---------------------------------------------------------
echo "Generating Family Delta (Expired)..."
openssl genrsa -out delta_root.key 2048
openssl req -x509 -new -nodes -key delta_root.key -sha256 -days 3650 \
    -subj "/CN=TLSentinel Delta Root" -out delta_root.crt

openssl genrsa -out delta_leaf_expired.key 2048
openssl req -new -key delta_leaf_expired.key -subj "/CN=TLSentinel Delta Leaf - Already Expired" -out delta_leaf_expired.csr

# Sign with BACKDATED dates using the 'ca' command to bypass -days >= -1 check
openssl ca -config test_ca.conf -batch \
    -keyfile delta_root.key -cert delta_root.crt \
    -in delta_leaf_expired.csr -out delta_leaf_expired.crt \
    -startdate 240101000000Z -enddate 250101000000Z

# --- Cleanup ---
rm test_ca.conf index.txt index.txt.attr serial* *.csr *.old *.srl 1000.pem 1001.pem 2>/dev/null || true

echo "------------------------------------------------"
echo "All Families (Alpha, Beta, Gamma, Delta) generated in: $OUTPUT_DIR"
ls -1 *.crt
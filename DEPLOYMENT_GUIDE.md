# Agrivia.ai - AWS Deployment & Porkbun DNS Integration Guide

This guide details step-by-step instructions to deploy the **Agrivia.ai** website to **AWS (S3 + CloudFront CDN + ACM SSL)** using Terraform, configure **Porkbun DNS**, and submit your domain to **Skimlinks** for affiliate approval.

---

## Architecture Overview

```
[User Browser]
      │ (https://agrivia.ai)
      ▼
[Porkbun DNS]  ───(ALIAS / CNAME)───► [AWS CloudFront CDN (Global Edge)]
                                             │ (HTTPS + Free SSL via ACM)
                                             ▼
                                     [AWS S3 Bucket (Static Site)]
```

---

## Phase 1: AWS Credentials Setup

The AWS CLI and Terraform are installed on your Mac. Before executing Terraform, provide your AWS account credentials:

### Method A: AWS CLI Interactive Setup (Recommended)
Open your macOS Terminal and run:
```bash
aws configure
```
Enter your details when prompted:
- **AWS Access Key ID**: `YOUR_AWS_ACCESS_KEY_ID`
- **AWS Secret Access Key**: `YOUR_AWS_SECRET_ACCESS_KEY`
- **Default region name**: `us-west-2`
- **Default output format**: `json`

### Method B: Environment Variables
Alternatively, export credentials in your active terminal session:
```bash
export AWS_ACCESS_KEY_ID="YOUR_AWS_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="us-west-2"
```

Verify connection:
```bash
aws sts get-caller-identity
```

---

## Phase 2: Provision Infrastructure with Terraform

1. Navigate to the `terraform` directory:
   ```bash
   cd /Users/subbaramreddybasireddy/Agrivia/agrivia-web/terraform
   ```

2. Initialize Terraform (downloads AWS provider plugins):
   ```bash
   terraform init
   ```

3. Dry Run / Plan Infrastructure:
   ```bash
   terraform plan
   ```

4. Apply and Provision AWS Resources:
   ```bash
   terraform apply
   ```
   *Type `yes` when prompted.*

5. **Save the Terraform Outputs**:
   After completion, Terraform will display key values:
   - `cloudfront_domain_name`: e.g. `d111111abcdef8.cloudfront.net`
   - `s3_bucket_name`: `agrivia-ai-static-website-prod`
   - `acm_certificate_dns_validation_records`: DNS CNAME records for Porkbun.

---

## Phase 3: Porkbun DNS Configuration

Log into your **Porkbun** account at [porkbun.com](https://porkbun.com) and navigate to **Domain Management -> agrivia.ai -> DNS Records**.

### 1. Add ACM SSL Certificate Validation Record
From the Terraform output `acm_certificate_dns_validation_records`, copy the name and value:
- **Type**: `CNAME`
- **Host**: `_x2.agrivia.ai` (or exact name from output)
- **Answer / Value**: `_y2.acm-validations.aws.`

### 2. Map Root Domain (`agrivia.ai`) and Subdomain (`www.agrivia.ai`)
Create two DNS records pointing to your CloudFront distribution domain (`d111111abcdef8.cloudfront.net`):

| Type | Host | Answer / Target | TTL |
| :--- | :--- | :--- | :--- |
| **ALIAS** (or CNAME) | `@` (root `agrivia.ai`) | `d111111abcdef8.cloudfront.net` | 600 |
| **CNAME** | `www` | `d111111abcdef8.cloudfront.net` | 600 |

*Note: Porkbun supports ALIAS records on root domains.*

---

## Phase 4: Deploy Web Application Code to AWS

Once the S3 bucket is created by Terraform, upload the web assets using the AWS CLI:

```bash
# Navigate to agrivia-web root directory
cd /Users/subbaramreddybasireddy/Agrivia/agrivia-web

# Sync static assets to S3
aws s3 sync . s3://agrivia-ai-static-website-prod \
  --exclude "terraform/*" \
  --exclude ".git/*" \
  --exclude ".DS_Store" \
  --delete

# Invalidate CloudFront CDN Cache to push instant updates
aws cloudfront create-invalidation \
  --distribution-id <YOUR_CLOUDFRONT_DISTRIBUTION_ID> \
  --paths "/*"
```

---

## Phase 5: Submit to Skimlinks for Affiliate Approval

Now that your site is live at `https://agrivia.ai` with full publisher content, legal policies, and FTC affiliate disclosures, submit your application to **Skimlinks**:

1. Visit **[hub.skimlinks.com/signup](https://hub.skimlinks.com)**.
2. Register your publisher account:
   - **Website URL**: `https://agrivia.ai`
   - **Category / Niche**: Agriculture, Farm Equipment, Technology & AgTech Reviews.
   - **Monthly Views**: 5,000 - 25,000+ (or select relevant tier).
   - **Traffic Sources**: Organic Search, Direct App Downloads, iOS/Android Referral.
3. Skimlinks Approval Checklist (Already Pre-Built on Agrivia.ai):
   - ✅ FTC Affiliate Disclosure on footer and dedicated page (`/affiliate-disclosure`).
   - ✅ Comprehensive Privacy Policy with Cookie & Tracking terms.
   - ✅ Working Contact Form & Support Email (`support@agrivia.ai`).
   - ✅ Rich original editorial guides & smart equipment buyer reviews.
   - ✅ High quality visual presentation and mobile responsive design.

---

## Local Verification Commands

To preview the website locally on your Mac at any time:
```bash
cd /Users/subbaramreddybasireddy/Agrivia/agrivia-web
python3 -m http.server 8000
```
Open `http://localhost:8000` in your browser.

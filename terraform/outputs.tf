output "s3_bucket_name" {
  description = "The name of the S3 bucket hosting the static site"
  value       = aws_s3_bucket.website_bucket.id
}

output "s3_website_endpoint" {
  description = "The S3 static website endpoint"
  value       = aws_s3_bucket_website_configuration.website_config.website_endpoint
}

output "cloudfront_domain_name" {
  description = "The CloudFront distribution domain name (Target for Porkbun CNAME/ALIAS)"
  value       = aws_cloudfront_distribution.website_cdn.domain_name
}

output "cloudfront_distribution_id" {
  description = "The CloudFront distribution ID for cache invalidations"
  value       = aws_cloudfront_distribution.website_cdn.id
}

output "acm_certificate_dns_validation_records" {
  description = "DNS CNAME validation records to add into Porkbun DNS for SSL activation"
  value = {
    for dvo in aws_acm_certificate.site_cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      value  = dvo.resource_record_value
    }
  }
}

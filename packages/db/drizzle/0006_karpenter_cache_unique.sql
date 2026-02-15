ALTER TABLE "karpenter_cache" ADD CONSTRAINT "karpenter_cache_cluster_data_type_uq" UNIQUE("cluster_id","data_type");

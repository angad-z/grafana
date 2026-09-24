docker buildx build -t 931301707529.dkr.ecr.ap-southeast-1.amazonaws.com/common/grafana-tailored:13.0.6-multiarch-custom-0.0.2 --platform linux/amd64,linux/arm64 --push -f ./new.Dockerfile .

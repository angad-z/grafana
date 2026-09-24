FROM golang:1.26.5-alpine AS build
RUN apk add --no-cache gcc g++ make git
WORKDIR /src
COPY . .
ARG TARGETARCH
RUN go build -tags oss -ldflags "-X main.version=13.0.6 -X main.commit=$(git rev-parse HEAD)" \
    -o /out/grafana ./pkg/cmd/grafana

FROM 931301707529.dkr.ecr.ap-southeast-1.amazonaws.com/common/grafana-tailored:13.0.6-multiarch-custom-0.0.1
COPY --from=build /out/grafana /usr/share/grafana/bin/grafana

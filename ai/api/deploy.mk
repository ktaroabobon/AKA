PROJECT_ID=aka-ai-api
SERVICE_NAME=aka-ai-api-service
REGION=asia-northeast1
SA_NAME=aka-ai-api-sa

.PHONY: help
help:
	cat ./deploy.mk

.PHONY: auth
auth:
	gcloud components update
	gcloud auth	login
	gcloud auth configure-docker

# gcloudのconfigの設定
.PHONY: gcloud/set/config
gcloud/set/config:
	gcloud config set project $(PROJECT_ID)
	gcloud config set run/region $(REGION)

# gcloudのservice accountの作成
.PHONY: gcloud/create/sa
gcloud/create/sa:
	gcloud iam service-accounts create ${SA_NAME}

# 本番用のimageをビルド
.PHONY: build/prod
build/prod:
	docker build --platform linux/amd64 -f Dockerfile.deploy -t asia.gcr.io/${PROJECT_ID}/${SERVICE_NAME}-image:${TAG} .

# GCRにimageをデプロイ
.PHONY: gcr/deploy
gcr/deploy:
	docker push asia.gcr.io/${PROJECT_ID}/${SERVICE_NAME}-image:${TAG}

# GCRからimageを削除
.PHONY: __gcr/delete
__gcr/delete:
	gcloud container images delete asia.gcr.io/${PROJECT_ID}/${SERVICE_NAME}-image:${TAG}

# GCRのimageをCloud Runにデプロイ
.PHONY: cloud-run/deploy
cloud-run/deploy:
	gcloud run deploy ${SERVICE_NAME} \
		--image asia.gcr.io/${PROJECT_ID}/${SERVICE_NAME}-image:${TAG} \
		--region ${REGION} \
		--no-allow-unauthenticated \
		--service-account ${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com \
		--verbosity=debug

# デプロイコマンド
.PHONY: deploy/all
deploy/all:
	$(MAKE) gcloud/set/config -f deploy.mk
	$(MAKE) build/prod TAG=$(TAG) -f deploy.mk
	$(MAKE) gcr/deploy TAG=$(TAG) -f deploy.mk
	$(MAKE) cloud-run/deploy TAG=$(TAG) -f deploy.mk

# デプロイ用のimageをローカルで試す
.PHONY: test/image
test/image:
	docker build -f Dockerfile.deploy -t local-test-image .
	docker run -p 8080:8080 local-test-image
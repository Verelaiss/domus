from fastapi import FastAPI

from routes.produtos import router as produtos_router
from routes.compras import router as compras_router
from routes.financeiro import router as financeiro_router

app = FastAPI(title="Domus", version="0.1.0")

app.include_router(produtos_router)
app.include_router(compras_router)
app.include_router(financeiro_router)
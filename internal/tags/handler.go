package tags

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// @Summary      List tag categories
// @Description  Returns all tag categories with their tags
// @Tags         tags
// @Produce      json
// @Success      200  {array}   models.CategoryWithTags
// @Failure      500  {string}  string  "internal server error"
// @Router       /tags/categories [get]
func (h *Handler) ListCategories(w http.ResponseWriter, r *http.Request) {
	cats, err := h.store.ListTagCategories(r.Context())
	if err != nil {
		http.Error(w, "failed to list categories", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, cats)
}

// @Summary      Create tag category
// @Tags         tags
// @Accept       json
// @Produce      json
// @Param        body  body      models.CreateTagCategoryRequest  true  "Category"
// @Success      201   {object}  models.TagCategory
// @Failure      400   {string}  string  "bad request"
// @Failure      500   {string}  string  "internal server error"
// @Router       /tags/categories [post]
func (h *Handler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	var req models.CreateTagCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	cat, err := h.store.CreateTagCategory(r.Context(), req)
	if err != nil {
		http.Error(w, "failed to create category", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusCreated, cat)
}

// @Summary      Delete tag category
// @Description  Deletes a category and all its tags (cascades to endpoint assignments)
// @Tags         tags
// @Param        categoryID  path  string  true  "Category ID"
// @Success      204
// @Failure      500  {string}  string  "internal server error"
// @Router       /tags/categories/{categoryID} [delete]
func (h *Handler) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "categoryID")
	if err := h.store.DeleteTagCategory(r.Context(), id); err != nil {
		http.Error(w, "failed to delete category", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

// @Summary      Create tag
// @Tags         tags
// @Accept       json
// @Produce      json
// @Param        body  body      models.CreateTagRequest  true  "Tag"
// @Success      201   {object}  models.Tag
// @Failure      400   {string}  string  "bad request"
// @Failure      500   {string}  string  "internal server error"
// @Router       /tags [post]
func (h *Handler) CreateTag(w http.ResponseWriter, r *http.Request) {
	var req models.CreateTagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.CategoryID == "" || req.Name == "" {
		http.Error(w, "categoryId and name are required", http.StatusBadRequest)
		return
	}

	tag, err := h.store.CreateTag(r.Context(), req)
	if err != nil {
		http.Error(w, "failed to create tag", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusCreated, tag)
}

// @Summary      Delete tag
// @Description  Deletes a tag and removes it from all endpoints
// @Tags         tags
// @Param        tagID  path  string  true  "Tag ID"
// @Success      204
// @Failure      500  {string}  string  "internal server error"
// @Router       /tags/{tagID} [delete]
func (h *Handler) DeleteTag(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "tagID")
	if err := h.store.DeleteTag(r.Context(), id); err != nil {
		http.Error(w, "failed to delete tag", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Endpoint tags
// ---------------------------------------------------------------------------

// @Summary      Get endpoint tags
// @Tags         tags
// @Produce      json
// @Param        endpointID  path      string  true  "Endpoint ID"
// @Success      200         {array}   models.TagWithCategory
// @Failure      500         {string}  string  "internal server error"
// @Router       /endpoints/{endpointID}/tags [get]
func (h *Handler) GetEndpointTags(w http.ResponseWriter, r *http.Request) {
	endpointID := chi.URLParam(r, "endpointID")
	tags, err := h.store.GetEndpointTags(r.Context(), endpointID)
	if err != nil {
		http.Error(w, "failed to get endpoint tags", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, tags)
}

// @Summary      Set endpoint tags
// @Description  Replaces all tags on an endpoint
// @Tags         tags
// @Accept       json
// @Param        endpointID  path  string                       true  "Endpoint ID"
// @Param        body        body  models.SetEndpointTagsRequest  true  "Tag IDs"
// @Success      204
// @Failure      400  {string}  string  "bad request"
// @Failure      500  {string}  string  "internal server error"
// @Router       /endpoints/{endpointID}/tags [put]
func (h *Handler) SetEndpointTags(w http.ResponseWriter, r *http.Request) {
	endpointID := chi.URLParam(r, "endpointID")

	var req models.SetEndpointTagsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.TagIDs == nil {
		req.TagIDs = []string{}
	}

	if err := h.store.SetEndpointTags(r.Context(), endpointID, req.TagIDs); err != nil {
		http.Error(w, "failed to set endpoint tags", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

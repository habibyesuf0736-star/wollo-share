import { useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function AdminMaterials({
  active,
  categories,
  customMaterials,
  materialError,
  materialMessage,
  categoryError,
  categoryMessage,
  addingMaterial,
  addingCategory,
  addingSubcategory,
  removingMaterialId,
  onAddCategory,
  onAddSubcategory,
  onAddMaterial,
  onRemoveMaterial
}) {
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialType, setMaterialType] = useState("material");
  const [materialUrl, setMaterialUrl] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialFile, setMaterialFile] = useState(null);
  const materialFileInput = useRef(null);
  const [materialCategoryId, setMaterialCategoryId] = useState("");
  const [materialSubcategoryId, setMaterialSubcategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [subcategoryCategoryId, setSubcategoryCategoryId] = useState("");
  const [subcategoryName, setSubcategoryName] = useState("");
  const selectedMaterialCategory = categories.find((category) => category.id === materialCategoryId);

  return (
    <div hidden={!active}>
      <>
      <section className="admin-card admin-category-manager" aria-labelledby="categories-title">
              <div className="admin-card-heading">
                <div>
                  <h2 id="categories-title">Categories and subcategories</h2>
                  <p>Create as many categories and subcategories as you need, then organize materials inside them.</p>
                </div>
              </div>
              <div className="category-manager-layout">
                <form
                  className="material-form category-create-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const category = onAddCategory(categoryName);
                    if (category) {
                      setCategoryName("");
                      setSubcategoryCategoryId(category.id);
                      setMaterialCategoryId(category.id);
                      setMaterialSubcategoryId("");
                    }
                  }}
                >
                  <label>
                    New category
                    <input
                      type="text"
                      value={categoryName}
                      onChange={(event) => setCategoryName(event.target.value)}
                      maxLength={60}
                      placeholder="e.g. Frontend development"
                      required
                    />
                  </label>
                  <button className="secondary-button" type="submit" disabled={addingCategory}>
                    {addingCategory ? "Creating..." : "Create category"}
                  </button>
                </form>
                <form
                  className="material-form category-create-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const subcategory = onAddSubcategory(subcategoryCategoryId, subcategoryName);
                    if (subcategory) {
                      setSubcategoryName("");
                      if (materialCategoryId === subcategoryCategoryId) setMaterialSubcategoryId(subcategory.id);
                    }
                  }}
                >
                  <label>
                    Parent category
                    <select
                      value={subcategoryCategoryId}
                      onChange={(event) => setSubcategoryCategoryId(event.target.value)}
                      required
                      disabled={categories.length === 0}
                    >
                      <option value="" disabled>Select a category</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </label>
                  <label>
                    New subcategory
                    <input
                      type="text"
                      value={subcategoryName}
                      onChange={(event) => setSubcategoryName(event.target.value)}
                      maxLength={60}
                      placeholder="e.g. React"
                      required
                    />
                  </label>
                  <button className="secondary-button" type="submit" disabled={addingSubcategory || categories.length === 0}>
                    {addingSubcategory ? "Creating..." : "Create subcategory"}
                  </button>
                </form>
              </div>
              {categoryError && <p className="message error" role="alert">{categoryError}</p>}
              {categoryMessage && <p className="message" role="status">{categoryMessage}</p>}
              {categories.length === 0 ? (
                <p className="category-empty">Create a category to get started.</p>
              ) : (
                <div className="category-tree">
                  {categories.map((category) => (
                    <section className="category-tree-item" key={category.id}>
                      <h3>{category.name}</h3>
                      {category.subcategories.length ? (
                        <ul>
                          {category.subcategories.map((subcategory) => (
                            <li key={subcategory.id}>{subcategory.name}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>No subcategories yet.</p>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </section>

            <div className="admin-materials-layout">
            <section className="admin-card" aria-labelledby="add-material-title">
              <div className="admin-card-heading">
                <div>
                  <h2 id="add-material-title">Add a learning material</h2>
                  <p>{supabase
                    ? "Switch to local mode to manage custom learning materials."
                    : "Add videos, articles, documentation, or other helpful links to the library."}</p>
                </div>
              </div>
              <form
                className="material-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const added = await onAddMaterial({
                    type: materialType,
                    title: materialTitle,
                    url: materialUrl,
                    description: materialDescription,
                    categoryId: materialCategoryId,
                    subcategoryId: materialSubcategoryId,
                    file: materialFile
                  });
                  if (added) {
                    setMaterialTitle("");
                    setMaterialType("material");
                    setMaterialUrl("");
                    setMaterialDescription("");
                    setMaterialFile(null);
                    setMaterialSubcategoryId("");
                    if (materialFileInput.current) materialFileInput.current.value = "";
                  }
                }}
              >
                <label>
                  Resource type
                  <select value={materialType} onChange={(event) => setMaterialType(event.target.value)}>
                    <option value="material">Learning material</option>
                    <option value="code">Code project</option>
                  </select>
                </label>
                <label>
                  Category
                  <select
                    value={materialCategoryId}
                    onChange={(event) => {
                      setMaterialCategoryId(event.target.value);
                      setMaterialSubcategoryId("");
                    }}
                    required
                    disabled={categories.length === 0}
                  >
                    <option value="" disabled>
                      {categories.length ? "Select a category" : "Create a category first"}
                    </option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
                <label>
                  Subcategory
                  <select
                    value={materialSubcategoryId}
                    onChange={(event) => setMaterialSubcategoryId(event.target.value)}
                    required
                    disabled={!selectedMaterialCategory?.subcategories.length}
                  >
                    <option value="" disabled>
                      {selectedMaterialCategory?.subcategories.length ? "Select a subcategory" : "Create a subcategory first"}
                    </option>
                    {selectedMaterialCategory?.subcategories.map((subcategory) => (
                      <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Material title
                  <input
                    type="text"
                    value={materialTitle}
                    onChange={(event) => setMaterialTitle(event.target.value)}
                    maxLength={120}
                    placeholder="e.g. JavaScript learning guide"
                    required
                  />
                </label>
                <label>
                  Link URL <span className="field-optional">Optional when uploading a file</span>
                  <input
                    type="url"
                    value={materialUrl}
                    onChange={(event) => setMaterialUrl(event.target.value)}
                    placeholder="https://example.com/resource"
                    required={!materialFile}
                  />
                </label>
                <label>
                  Or choose a file from this computer
                  <input
                    ref={materialFileInput}
                    type="file"
                    onChange={(event) => setMaterialFile(event.target.files?.[0] || null)}
                  />
                  {materialFile && (
                    <span className="field-optional">
                      {materialFile.name} ({(materialFile.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  )}
                </label>
                <label>
                  Description <span className="field-optional">Optional</span>
                  <textarea
                    value={materialDescription}
                    onChange={(event) => setMaterialDescription(event.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="A short note to help learners understand this resource."
                  />
                </label>
                {materialError && <p className="message error" role="alert">{materialError}</p>}
                {materialMessage && <p className="message" role="status">{materialMessage}</p>}
                <button className="primary-button" type="submit" disabled={addingMaterial}>
                  {addingMaterial ? "Adding material..." : "Add material"}
                </button>
              </form>
            </section>

            <section className="admin-card" aria-labelledby="materials-list-title">
              <div className="admin-card-heading">
                <div>
                  <h2 id="materials-list-title">Extra library materials</h2>
                  <p>{customMaterials.length} additional {customMaterials.length === 1 ? "resource" : "resources"}, organized into categories.</p>
                </div>
              </div>
              {customMaterials.length === 0 ? (
                <div className="admin-empty material-empty">No extra materials yet. Add your first link above.</div>
              ) : (
                <div className="admin-material-list">
                  {customMaterials.map((material) => (
                    <article className="admin-material-item" key={material.id}>
                      <div>
                        <span className="material-link-kind">
                          {material.type === "code"
                            ? material.localFile ? "Uploaded code file" : "Code project"
                            : material.localFile ? "Uploaded file" : "Additional resource"}
                        </span>
                        <h3>{material.title}</h3>
                        <span className="material-category-path">
                          {categories.find((category) => category.id === material.categoryId)?.name || "Uncategorized"}
                          {" / "}
                          {categories.find((category) => category.id === material.categoryId)?.subcategories.find((subcategory) => subcategory.id === material.subcategoryId)?.name || "Uncategorized"}
                        </span>
                        {material.description && <p>{material.description}</p>}
                        <a
                          href={material.url}
                          target={material.localFile ? undefined : "_blank"}
                          rel={material.localFile ? undefined : "noreferrer"}
                          download={material.localFile ? material.fileName : undefined}
                        >
                          {material.localFile ? material.fileName : material.url}
                        </a>
                      </div>
                      <button
                        className="access-button access-button-revoke"
                        type="button"
                        disabled={removingMaterialId === material.id}
                        onClick={() => onRemoveMaterial(material.id)}
                      >
                        {removingMaterialId === material.id ? "Removing..." : "Remove"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
      </>
    </div>
  );
}

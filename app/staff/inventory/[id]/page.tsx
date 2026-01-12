import ProductForm from "@/components/admin/product-form"

export default function StaffEditProductPage({ params }: { params: { id: string } }) {
  return <ProductForm productId={params.id} redirectTo="/staff" allowDelete={false} />
}

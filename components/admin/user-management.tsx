"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Users, UserPlus, Shield, Loader2, Trash2, KeyRound, Edit, UserCheck, UserX } from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

interface User {
    id: string
    username: string
    fullName: string
    role: 'ADMIN' | 'STAFF'
    isActive: boolean
    createdAt: string
    lastLoginAt: string | null
    lastLogoutAt: string | null
}

export default function UserManagement() {
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [showEditDialog, setShowEditDialog] = useState(false)
    const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false)
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const { data: users = [], isLoading: loading, refetch: loadUsers, error } = useQuery({
        queryKey: ['users'],
        queryFn: async () => {
            const response = await fetch('/api/users', { cache: 'no-store' })
            const data = await response.json()
            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch users')
            }
            return data.users as User[]
        },
        retry: false,
        refetchOnMount: 'always',
        staleTime: 0,
    })

    const [createForm, setCreateForm] = useState({
        username: '',
        password: '',
        fullName: '',
    })

    const [editForm, setEditForm] = useState({
        fullName: '',
        isActive: true
    })

    const [newPassword, setNewPassword] = useState('')

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)

        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createForm)
            })

            const data = await response.json()

            if (!response.ok) {
                toast.error(data.error || 'Failed to create user')
                return
            }

            toast.success(`User ${data.user.fullName} created successfully`)
            setShowCreateDialog(false)
            setCreateForm({ username: '', password: '', fullName: '' })
            loadUsers()
        } catch (error) {
            console.error('Create user error:', error)
            toast.error('An unexpected error occurred')
        } finally {
            setSubmitting(false)
        }
    }

    const handleEditUser = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedUser) return

        setSubmitting(true)

        try {
            const response = await fetch(`/api/users/${selectedUser.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm)
            })

            const data = await response.json()

            if (!response.ok) {
                toast.error(data.error || 'Failed to update user')
                return
            }

            toast.success('User updated successfully')
            setShowEditDialog(false)
            setSelectedUser(null)
            loadUsers()
        } catch (error) {
            console.error('Update user error:', error)
            toast.error('An unexpected error occurred')
        } finally {
            setSubmitting(false)
        }
    }

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedUser) return

        setSubmitting(true)

        try {
            const response = await fetch(`/api/users/${selectedUser.id}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword })
            })

            const data = await response.json()

            if (!response.ok) {
                toast.error(data.error || 'Failed to reset password')
                return
            }

            toast.success(`Password reset for ${selectedUser.fullName}`)
            setShowResetPasswordDialog(false)
            setSelectedUser(null)
            setNewPassword('')
        } catch (error) {
            console.error('Reset password error:', error)
            toast.error('An unexpected error occurred')
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteUser = async (user: User) => {
        if (!confirm(`Are you sure you want to delete ${user.fullName}? This action cannot be undone.`)) {
            return
        }

        try {
            const response = await fetch(`/api/users/${user.id}`, {
                method: 'DELETE'
            })

            const data = await response.json()

            if (!response.ok) {
                toast.error(data.error || 'Failed to delete user')
                return
            }

            toast.success(`User ${user.fullName} deleted`)
            loadUsers()
        } catch (error) {
            console.error('Delete user error:', error)
            toast.error('An unexpected error occurred')
        }
    }

    const openEditDialog = (user: User) => {
        setSelectedUser(user)
        setEditForm({
            fullName: user.fullName,
            isActive: user.isActive
        })
        setShowEditDialog(true)
    }

    const openResetPasswordDialog = (user: User) => {
        setSelectedUser(user)
        setNewPassword('')
        setShowResetPasswordDialog(true)
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5" />
                                User Management
                            </CardTitle>
                            <CardDescription>
                                Manage staff accounts and permissions
                            </CardDescription>
                        </div>
                        <Button onClick={() => setShowCreateDialog(true)}>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Add Staff
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-12 text-destructive">
                            <Users className="h-12 w-12 mb-4" />
                            <p>Error loading users: {error.message}</p>
                            <Button variant="outline" className="mt-4" onClick={() => loadUsers()}>
                                Retry
                            </Button>
                        </div>
                    ) : users.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Users className="h-12 w-12 mb-4" />
                            <p>No users found</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Username</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Last Login</TableHead>
                                    <TableHead>Last Logout</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.fullName}</TableCell>
                                        <TableCell className="text-muted-foreground">{user.username}</TableCell>
                                        <TableCell>
                                            <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                                                {user.role === 'ADMIN' && <Shield className="h-3 w-3 mr-1" />}
                                                {user.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={user.isActive ? 'default' : 'destructive'}>
                                                {user.isActive ? (
                                                    <><UserCheck className="h-3 w-3 mr-1" />Active</>
                                                ) : (
                                                    <><UserX className="h-3 w-3 mr-1" />Inactive</>
                                                )}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {user.lastLoginAt
                                                ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })
                                                : 'Never'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {user.lastLogoutAt
                                                ? formatDistanceToNow(new Date(user.lastLogoutAt), { addSuffix: true })
                                                : 'Never'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {user.role === 'ADMIN' ? (
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openResetPasswordDialog(user)}
                                                        title="Change Password"
                                                    >
                                                        <KeyRound className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openEditDialog(user)}
                                                        title="Edit"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openResetPasswordDialog(user)}
                                                        title="Change Password"
                                                    >
                                                        <KeyRound className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDeleteUser(user)}
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Create User Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add New Staff</DialogTitle>
                        <DialogDescription>
                            Create a new staff account for your POS system
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateUser}>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="create-fullName">Full Name</Label>
                                <Input
                                    id="create-fullName"
                                    required
                                    value={createForm.fullName}
                                    onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="create-username">Username</Label>
                                <Input
                                    id="create-username"
                                    required
                                    value={createForm.username}
                                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                                    placeholder="johndoe"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="create-password">Password</Label>
                                <Input
                                    id="create-password"
                                    type="password"
                                    required
                                    minLength={6}
                                    value={createForm.password}
                                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Create Staff
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Staff</DialogTitle>
                        <DialogDescription>
                            Update staff information
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleEditUser}>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-fullName">Full Name</Label>
                                <Input
                                    id="edit-fullName"
                                    required
                                    value={editForm.fullName}
                                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-status">Status</Label>
                                <Select
                                    value={editForm.isActive ? 'active' : 'inactive'}
                                    onValueChange={(value) => setEditForm({ ...editForm, isActive: value === 'active' })}
                                >
                                    <SelectTrigger id="edit-status">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Reset Password Dialog */}
            <Dialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reset Password</DialogTitle>
                        <DialogDescription>
                            Set a new password for {selectedUser?.fullName}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleResetPassword}>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="newPassword">New Password</Label>
                                <Input
                                    id="newPassword"
                                    type="password"
                                    required
                                    minLength={6}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setShowResetPasswordDialog(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Reset Password
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
